import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { auth } from './auth'
import { internal } from './_generated/api'
import { rateLimiter } from './rateLimiter'

const http = httpRouter()

auth.addHttpRoutes(http)

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(new Uint8Array(digest))
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function rateLimitResponse(retryAfterSec: number, scope: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      scope,
      retryAfterSeconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(Math.max(1, Math.ceil(retryAfterSec))),
      },
    },
  )
}

http.route({
  path: '/log',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const globalLimit = await rateLimiter.limit(ctx, 'logGlobal')
    if (!globalLimit.ok) {
      return rateLimitResponse(globalLimit.retryAfter / 1000, 'global')
    }

    const token = req.headers.get('x-shortcut-token')
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const tokenHash = await sha256Hex(token)
    const match = await ctx.runQuery(
      internal.shortcutTokens.findByHash,
      { tokenHash },
    )
    if (!match) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const tokenLimit = await rateLimiter.limit(ctx, 'logPerToken', {
      key: match._id,
    })
    if (!tokenLimit.ok) {
      return rateLimitResponse(tokenLimit.retryAfter / 1000, 'token')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('tasks' in body) ||
      !Array.isArray(body.tasks)
    ) {
      return jsonResponse({ error: 'tasks array required' }, 400)
    }

    const rawTasks = (body as { tasks: Array<unknown> }).tasks
    let tasks: Array<string | { label: string; hours?: string }>
    try {
      tasks = rawTasks.map((t) => {
        if (typeof t === 'string') return t
        if (t && typeof t === 'object') {
          const obj = t as { label?: unknown; hours?: unknown }
          if (typeof obj.label !== 'string') {
            throw new Error('Each task object must have a string `label`')
          }
          return {
            label: obj.label,
            hours: typeof obj.hours === 'string' ? obj.hours : undefined,
          }
        }
        throw new Error('Each task must be a string or { label, hours? }')
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid tasks'
      return jsonResponse({ error: message }, 400)
    }

    try {
      const result = await ctx.runMutation(
        internal.entries.logEntryFromShortcut,
        { userId: match.userId, tokenId: match._id, tasks },
      )
      return jsonResponse({ ok: true, ...result }, 200)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return jsonResponse({ error: message }, 400)
    }
  }),
})

export default http
