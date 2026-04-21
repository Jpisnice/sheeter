Welcome to your new TanStack Start app! 

# Getting Started

To run this application:

```bash
npm install
npm run dev
```

# Building For Production

To build this application for production:

```bash
npm run build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. You can run the tests with:

```bash
npm run test
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Uninstall the packages: `npm install @tailwindcss/vite tailwindcss -D`

## Linting & Formatting


This project uses [eslint](https://eslint.org/) and [prettier](https://prettier.io/) for linting and formatting. Eslint is configured using [tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint). The following scripts are available:

```bash
npm run lint
npm run format
npm run check
```


## Setting up Convex

- Set the `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT` environment variables in your `.env.local`. (Or run `npx -y convex init` to set them automatically.)
- Run `npx -y convex dev` to start the Convex server.



## Settings page

The web app has a `/settings` route (linked from the top bar) with two sections:

- **Profile** — shows the signed-in user (name, email, initial) and a sign-out button.
- **Extras → Apple Shortcut access** — create, list, and revoke personal-access tokens used by the `/log` HTTP endpoint, view the endpoint URL, and copy a ready-made `curl` smoke-test.

Tokens are per-user. Each signed-in user manages their own tokens — Sheeter is fully multi-tenant for Shortcut access.

## Apple Shortcuts integration

Sheeter exposes a single HTTP endpoint (`convex/http.ts`) so you can log today's timesheet from iOS/macOS Shortcuts, Siri, a Home Screen icon, or an Apple Watch complication — without opening the web app.

### How auth works

Instead of a single shared `SHORTCUT_TOKEN` env var, every request carries a **personal-access token** issued from `/settings → Extras`. Tokens look like `sk_<48-hex>`. We only ever store their SHA-256 hash in the `shortcutTokens` table; the plaintext is shown **once** at creation time. The HTTP action hashes the incoming header, looks the row up via the `by_tokenHash` index, writes the entry against that row's `userId`, and stamps `lastUsedAt`.

This means:

- Multiple users can share one deployment — each with their own tokens.
- A single user can keep multiple tokens (e.g. iPhone, Watch, test script) and revoke them independently.
- Losing a device never reveals the token to anyone with DB read access, and revoking is instant.

### Endpoint

```
POST {VITE_CONVEX_SITE_URL}/log
Headers:
  content-type: application/json
  x-shortcut-token: sk_...
Body:
  { "tasks": [ <task>, <task>?, <task>? ] }
```

Where each `<task>` is either:

- a plain string — `"Refactored auth middleware"` (hours auto-computed), or
- an object — `{ "label": "Code review", "hours": "1:30" }` (hours locked).

Rules (enforced server-side in `resolveHours`):

- 1 to 3 tasks per call.
- If all tasks omit `hours`, the total is randomized between **7:30** and **8:00** and split across tasks.
- If all tasks set `hours`, the total must itself be between **7:30** and **8:00**.
- Mixed is allowed — locked hours are preserved, unlocked tasks fill the remainder.
- Each resolved task is at least **15 minutes**, snapped to 15-minute increments.
- The entry is written for **today** (server time) for the user that owns the token.

Response on success:

```json
{
  "ok": true,
  "entryId": "...",
  "totalHours": "7:45",
  "tasks": [{ "label": "...", "hours": "2:30" }, ...]
}
```

### 1. Issue a token

1. Sign in to the web app and open **Settings → Extras → Apple Shortcut access**.
2. Type a label (e.g. `iPhone`) and click **Create**.
3. Copy the `sk_…` token shown in the reveal dialog. **This is the only time the plaintext is displayed.** Close the dialog when saved.

You can create up to 10 tokens per user; revoke any from the same list with the trash icon.

The site URL is `VITE_CONVEX_SITE_URL` in `.env.local` (e.g. `https://patient-dinosaur-930.convex.site`).

### 2. Build the Shortcut (iOS / macOS)

Open the **Shortcuts** app → tap **+** to create a new shortcut, then add actions in this order:

1. **Ask for Input** — Prompt: `Task 1`, Input Type: *Text*. Rename the magic variable to `Task1`.
2. **Ask for Input** — Prompt: `Task 2 (leave blank to skip)`, Input Type: *Text*. Rename to `Task2`.
3. **Ask for Input** — Prompt: `Task 3 (leave blank to skip)`, Input Type: *Text*. Rename to `Task3`.
4. **Text** — content:
   ```
   {"tasks":[TASKS_PLACEHOLDER]}
   ```
   You'll build `TASKS_PLACEHOLDER` with an **If** chain below. The simplest robust approach: use three **If** actions that each append `"Task1"`, `,"Task2"`, `,"Task3"` to a variable when non-empty, then wrap the joined string in `{"tasks":[ … ]}`.

   If you want to skip the branching, use this single **Text** action instead and always provide 1–3 non-empty inputs:
   ```
   {"tasks":["Task1","Task2","Task3"]}
   ```
   (Drag the `Task1` / `Task2` / `Task3` variables into the quoted slots.)
5. **Get Contents of URL**:
   - URL: `https://<your-deployment>.convex.site/log`
   - Method: `POST`
   - Headers:
     - `content-type` → `application/json`
     - `x-shortcut-token` → the `sk_…` token you copied from Settings.
   - Request Body: **File** → choose the **Text** from step 4.
6. **Get Dictionary Value** — Key: `totalHours`, Dictionary: *Contents of URL*.
7. **Show Notification** — Title: `Sheeter`, Body: `Logged [Dictionary Value]`.

Save the shortcut as **Log today**. Tap the share icon → **Add to Home Screen** for a one-tap icon, or enable **Use with Siri** to say *"Hey Siri, log today"*.

### 3. Ready-made variants

**A. Fixed daily routine (zero prompts, one tap).** Replace step 4's Text body with:

```json
{"tasks":["Deep work","Code review","Meetings"]}
```

Remove the three **Ask for Input** actions. Hours will be auto-split between 7:30 and 8:00.

**B. Locked hours.** To pin specific durations, use object form:

```json
{"tasks":[
  {"label":"Deep work","hours":"4:00"},
  {"label":"Code review","hours":"1:30"},
  {"label":"Meetings","hours":"2:15"}
]}
```

Total must be between `7:30` and `8:00`.

**C. Dictation via Siri.** Replace the first **Ask for Input** with **Dictate Text** so you can say the task name instead of typing it.

### 4. Test from a terminal first

Before fiddling with the Shortcuts UI, confirm the endpoint works (the Settings page has a copy button for this exact snippet):

```bash
curl -X POST "$VITE_CONVEX_SITE_URL/log" \
  -H "content-type: application/json" \
  -H "x-shortcut-token: sk_..." \
  -d '{"tasks":["Shortcut smoke test"]}'
```

Expected: `200` with an `ok: true` payload. Common failures:

| Status | Cause |
| ------ | ----- |
| `401 Unauthorized` | Missing `x-shortcut-token` header, or the token isn't in the `shortcutTokens` table (maybe revoked or mistyped). |
| `400 Invalid JSON body` | Body wasn't valid JSON. |
| `400 tasks array required` | Body is missing `tasks` or it isn't a JSON array. |
| `400 Tasks must be between 1 and 3` | Sent 0 or 4+ tasks. |
| `400 Total hours must be between 7:30 and 8:00` | All tasks had `hours` but sum is outside the daily range. |
| `400 Token was revoked` | The token row was deleted between lookup and write (extremely rare — just create a new one). |

### 5. Security notes

- The `sk_…` value is a bearer credential — anyone with it can write an entry as that user. Treat it like a password.
- Plaintext tokens are never stored: only SHA-256 hashes live in the DB. The Convex dashboard won't reveal a usable token.
- To rotate: revoke the old row in Settings, create a new token, update your Shortcut's header.
- The endpoint only supports **today's** date by design; historical edits stay gated behind the logged-in web app.



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
