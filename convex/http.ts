import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { auth } from './auth'
import { internal } from './_generated/api'

const http = httpRouter()

auth.addHttpRoutes(http)

http.route({
  path: '/log',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const expected = process.env.SHORTCUT_TOKEN
    const token = req.headers.get('x-shortcut-token')
    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (
      !body ||
      typeof body !== 'object' ||
      !('tasks' in body) ||
      !Array.isArray(body.tasks)
    ) {
      return new Response(
        JSON.stringify({ error: 'tasks array required' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    const rawTasks = (body as { tasks: Array<unknown> }).tasks
    const tasks = rawTasks.map((t) => {
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

    try {
      const result = await ctx.runMutation(
        internal.entries.logEntryFromShortcut,
        { tasks },
      )
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
  }),
})

export default http
