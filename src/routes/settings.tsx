import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Check, Copy, KeyRound, Plus, Trash2, User } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { Dialog } from '../components/Dialog'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-2xl px-5 py-10">
          <Settings />
        </main>
      </div>
    </AuthGate>
  )
}

type TabId = 'profile' | 'extras'

const TABS: ReadonlyArray<{
  id: TabId
  label: string
  Icon: typeof User
  description: string
}> = [
  {
    id: 'profile',
    label: 'Profile',
    Icon: User,
    description: 'Signed-in identity used for the web app.',
  },
  {
    id: 'extras',
    label: 'Extras',
    Icon: KeyRound,
    description:
      "Personal-access tokens so an iOS/macOS Shortcut can log today's timesheet for you without signing in.",
  },
]

function parseTabFromHash(hash: string): TabId | null {
  const clean = hash.replace(/^#/, '')
  return clean === 'profile' || clean === 'extras' ? clean : null
}

function useTab(): [TabId, (next: TabId) => void] {
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'profile'
    return parseTabFromHash(window.location.hash) ?? 'profile'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onHash = () => {
      const next = parseTabFromHash(window.location.hash)
      if (next && next !== tab) setTab(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [tab])

  const select = (next: TabId) => {
    setTab(next)
    if (typeof window !== 'undefined') {
      const url = `${window.location.pathname}${window.location.search}#${next}`
      window.history.replaceState(null, '', url)
    }
  }

  return [tab, select]
}

function Settings() {
  const [tab, setTab] = useTab()
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="space-y-8">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Settings
        </div>
        <h1 className="mt-1 text-lg font-medium">{active.label}</h1>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-[#8b8780]">
          {active.description}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex items-center gap-1 border-b border-[#2a2826]"
      >
        {TABS.map((t) => {
          const isActive = t.id === tab
          const Icon = t.Icon
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-1.5 border-b px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                isActive
                  ? 'border-[#c9964a] text-[#c9964a]'
                  : 'border-transparent text-[#8b8780] hover:text-[#f0ede6]'
              }`}
            >
              <Icon size={12} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === 'profile' ? <ProfileSection /> : <ExtrasSection />}
      </div>
    </div>
  )
}

function ProfileSection() {
  const router = useRouter()
  const { signOut } = useAuthActions()
  const me = useQuery(api.entries.me)

  const onSignOut = async () => {
    await signOut()
    router.navigate({ to: '/login' })
  }

  const initial = useMemo(() => {
    const src = me?.name?.trim() || me?.email?.trim() || ''
    return src.charAt(0).toUpperCase() || '·'
  }, [me])

  return (
    <section>
      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        {me === undefined ? (
          <p className="font-mono text-xs text-[#8b8780]">loading…</p>
        ) : me === null ? (
          <p className="font-mono text-xs text-[#8b8780]">not signed in</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#2a2826] bg-[#0e0e0e] font-mono text-base text-[#c9964a]">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[#f0ede6]">
                {me.name || me.email || 'Signed in'}
              </div>
              {me.email ? (
                <div className="truncate font-mono text-xs text-[#8b8780]">
                  {me.email}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="rounded-md border border-[#2a2826] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] hover:border-[#c97b4a] hover:text-[#c97b4a]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function ExtrasSection() {
  return (
    <section className="space-y-4">
      <ShortcutEndpointCard />
      <ShortcutTokens />
      <ShortcutRecipeCard />
    </section>
  )
}

function ShortcutEndpointCard() {
  const siteUrl =
    (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ?? ''
  const endpoint = siteUrl ? `${siteUrl}/log` : 'https://<your-deployment>.convex.site/log'

  return (
    <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
        Endpoint
      </div>
      <div className="flex items-start justify-between gap-3">
        <code className="break-all font-mono text-xs text-[#f0ede6]">
          POST {endpoint}
        </code>
        <CopyButton value={endpoint} />
      </div>
      <div className="mt-3 text-[11px] leading-relaxed text-[#8b8780]">
        Send <code className="font-mono text-[#f0ede6]">x-shortcut-token</code>{' '}
        and a JSON body{' '}
        <code className="font-mono text-[#f0ede6]">{'{"tasks":[…]}'}</code>{' '}
        with 1–3 items. Each task is either a plain string (hours
        auto-computed) or{' '}
        <code className="font-mono text-[#f0ede6]">
          {'{"label":"…","hours":"H:MM"}'}
        </code>
        . Total must fall between 7:30 and 8:00.
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-[#6d6b67]">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Rate limits
        </span>{' '}
        — 30 requests / minute per token (burst 10), 600 / minute across the
        whole deployment, and 5 new tokens / hour per account. Limit breaches
        return <code className="font-mono text-[#f0ede6]">429</code> with a{' '}
        <code className="font-mono text-[#f0ede6]">retry-after</code> header.
      </div>
    </div>
  )
}

type TokenRow = {
  _id: Id<'shortcutTokens'>
  label: string
  lastFour: string
  createdAt: number
  lastUsedAt: number | null
}

function ShortcutTokens() {
  const tokens = useQuery(api.shortcutTokens.list)
  const create = useMutation(api.shortcutTokens.create)
  const revoke = useMutation(api.shortcutTokens.revoke)

  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<{
    token: string
    label: string
  } | null>(null)
  const [pendingRevoke, setPendingRevoke] = useState<TokenRow | null>(null)

  const onCreate = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await create({ label })
      setNewToken({ token: result.token, label: result.label })
      setLabel('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create token')
    } finally {
      setBusy(false)
    }
  }

  const onConfirmRevoke = async () => {
    if (!pendingRevoke) return
    setBusy(true)
    try {
      await revoke({ tokenId: pendingRevoke._id })
      setPendingRevoke(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke token')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60">
      <div className="border-b border-[#2a2826] p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Your tokens
        </div>
        {tokens === undefined ? (
          <p className="font-mono text-xs text-[#8b8780]">loading…</p>
        ) : tokens.length === 0 ? (
          <p className="font-mono text-xs text-[#8b8780]">
            No tokens yet. Create one below to use the Shortcut.
          </p>
        ) : (
          <ul className="divide-y divide-[#2a2826]">
            {tokens.map((tok) => (
              <li
                key={tok._id}
                className="flex items-center justify-between py-2 text-xs"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="truncate text-[#f0ede6]">{tok.label}</div>
                  <div className="font-mono text-[10px] text-[#8b8780]">
                    sk_…{tok.lastFour} · created{' '}
                    {formatDate(tok.createdAt)}
                    {tok.lastUsedAt
                      ? ` · used ${formatDate(tok.lastUsedAt)}`
                      : ' · never used'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRevoke(tok)}
                  className="flex items-center gap-1 rounded-md border border-[#2a2826] px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] hover:border-[#c97b4a] hover:text-[#c97b4a]"
                >
                  <Trash2 size={10} /> Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Create token
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onCreate()
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Label (e.g. iPhone, Watch)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            className="flex-1 rounded-md border border-[#2a2826] bg-[#0e0e0e] px-3 py-2 font-mono text-xs text-[#f0ede6] placeholder:text-[#4a4741] focus:border-[#c9964a] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-[#c9964a] px-3 py-2 font-mono text-[10px] uppercase tracking-wider font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
          >
            <Plus size={11} />
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
        {error ? (
          <p className="mt-2 font-mono text-xs text-[#c97b4a]">{error}</p>
        ) : null}
      </div>

      <TokenRevealDialog
        value={newToken}
        onClose={() => setNewToken(null)}
      />
      <Dialog
        open={!!pendingRevoke}
        variant="destructive"
        title={`Revoke “${pendingRevoke?.label ?? ''}”?`}
        description="Any Shortcut still using this token will stop working. This cannot be undone."
        confirmLabel="Revoke token"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={onConfirmRevoke}
        onCancel={() => {
          if (busy) return
          setPendingRevoke(null)
        }}
      />
    </div>
  )
}

function TokenRevealDialog({
  value,
  onClose,
}: {
  value: { token: string; label: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  if (!value) return null

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value.token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-[#2a2826] bg-[#151515] p-5 shadow-2xl">
        <h3 className="text-sm font-medium text-[#f0ede6]">
          Token created — copy it now
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[#8b8780]">
          This is the only time <span className="text-[#f0ede6]">{value.label}</span>’s
          token will be shown. Paste it into the{' '}
          <code className="font-mono text-[#f0ede6]">x-shortcut-token</code>{' '}
          header in your Shortcut, then close this dialog.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-md border border-[#2a2826] bg-[#0e0e0e] p-3">
          <code className="flex-1 break-all font-mono text-xs text-[#c9964a]">
            {value.token}
          </code>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#8b8780] hover:text-[#f0ede6]"
            aria-label="Copy token"
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? (
              <Check size={12} className="text-[#c9964a]" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#c9964a] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-medium text-[#0e0e0e] hover:bg-[#d7a35a]"
          >
            I saved it
          </button>
        </div>
      </div>
    </div>
  )
}

function ShortcutRecipeCard() {
  const siteUrl =
    (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ?? ''
  const endpoint = siteUrl
    ? `${siteUrl}/log`
    : 'https://<your-deployment>.convex.site/log'

  const bodyJson = '{"tasks":["Deep work","Code review","Meetings"]}'
  const tokenPlaceholder = '<paste your token>'

  // bash / zsh (macOS, Linux, WSL, Git Bash) — single-quoted JSON body,
  // backslash line continuations.
  const bashCurl = [
    `curl -X POST "${endpoint}" \\`,
    `  -H "content-type: application/json" \\`,
    `  -H "x-shortcut-token: ${tokenPlaceholder}" \\`,
    `  -d '${bodyJson}'`,
  ].join('\n')

  // PowerShell on Windows — do NOT use curl / curl.exe here. PowerShell 5.x
  // mangles embedded double quotes when invoking native exes, so any JSON
  // with `"…"` inside single quotes arrives at the server garbled and
  // req.json() rejects it ("Invalid JSON body"). Invoke-RestMethod takes
  // the body as a normal PowerShell string and sets Content-Type for us.
  const pwshCurl = [
    `$token = "${tokenPlaceholder}"`,
    `$body  = '${bodyJson}'`,
    `Invoke-RestMethod \``,
    `  -Uri "${endpoint}" \``,
    `  -Method Post \``,
    `  -ContentType "application/json" \``,
    `  -Headers @{ "x-shortcut-token" = $token } \``,
    `  -Body $body`,
  ].join('\n')

  return (
    <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
        Shortcut recipe
      </div>
      <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed text-[#8b8780]">
        <li>
          Open the <span className="text-[#f0ede6]">Shortcuts</span> app → tap{' '}
          <span className="text-[#f0ede6]">+</span>.
        </li>
        <li>
          Add a <span className="text-[#f0ede6]">Get Contents of URL</span>{' '}
          action.
        </li>
        <li>
          URL:{' '}
          <code className="break-all font-mono text-[#f0ede6]">
            {endpoint}
          </code>
          . Method: <span className="text-[#f0ede6]">POST</span>.
        </li>
        <li>
          Headers —{' '}
          <code className="font-mono text-[#f0ede6]">content-type</code>:{' '}
          <code className="font-mono text-[#f0ede6]">application/json</code>,{' '}
          <code className="font-mono text-[#f0ede6]">x-shortcut-token</code>:
          paste your token above.
        </li>
        <li>
          Request Body (JSON):{' '}
          <code className="font-mono text-[#f0ede6]">{bodyJson}</code>. Each
          task is either a bare string (hours auto-split between 7:30 and
          8:00) or an object{' '}
          <code className="font-mono text-[#f0ede6]">
            {'{"label":"…","hours":"2:30"}'}
          </code>
          . 1–3 tasks per call.
        </li>
        <li>
          Save as <span className="text-[#f0ede6]">Log today</span>, add to
          Home Screen, or enable Siri.
        </li>
      </ol>

      <div className="mt-4 space-y-3">
        <CodeSnippet label="Smoke test — bash / zsh (macOS, Linux, WSL)" value={bashCurl} />
        <CodeSnippet label="Smoke test — PowerShell (Windows)" value={pwshCurl} />
        <p className="font-mono text-[10px] leading-relaxed text-[#6d6b67]">
          Replace{' '}
          <code className="text-[#8b8780]">{tokenPlaceholder}</code> with a
          token from the list above. Expect{' '}
          <code className="text-[#8b8780]">200</code> +{' '}
          <code className="text-[#8b8780]">{'{"ok":true,…}'}</code>.{' '}
          <code className="text-[#8b8780]">401</code> = token missing or
          revoked.{' '}
          <code className="text-[#8b8780]">429</code> = rate-limited — the{' '}
          <code className="text-[#8b8780]">retry-after</code> header tells
          you how many seconds to wait.{' '}
          <code className="text-[#8b8780]">400</code> +{' '}
          <code className="text-[#8b8780]">{'{"error":"Invalid JSON body"}'}</code>{' '}
          usually means your shell mangled the body quotes — on Windows use
          the PowerShell snippet (it avoids{' '}
          <code className="text-[#8b8780]">curl.exe</code> because PowerShell
          strips embedded quotes when calling native exes).
        </p>
      </div>
    </div>
  )
}

function CodeSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          {label}
        </span>
        <CopyButton value={value} />
      </div>
      <pre className="overflow-x-auto rounded-md border border-[#2a2826] bg-[#0e0e0e] p-3 font-mono text-[11px] leading-relaxed text-[#f0ede6]">
        {value}
      </pre>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label="Copy"
      title={copied ? 'Copied' : 'Copy'}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#8b8780] hover:text-[#f0ede6]"
    >
      {copied ? (
        <Check size={11} className="text-[#c9964a]" />
      ) : (
        <Copy size={11} />
      )}
    </button>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = Date.now()
  const diffDays = Math.floor((now - ts) / 86400000)
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
