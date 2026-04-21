/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

function newTest() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}

const TOKEN = 'sk_testtoken_0123456789abcdef'

type LogResponse = {
  ok?: boolean
  error?: string
  entryId?: string
  totalHours?: string
  tasks?: Array<{ label: string; hours: string }>
}

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

async function setupUserWithToken(
  t: ReturnType<typeof convexTest>,
  token: string,
  label = 'iPhone',
) {
  const tokenHash = await sha256Hex(token)
  const { userId, tokenId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: 'Shortcut Owner',
      email: 'owner@example.com',
    })
    const tokenId = await ctx.db.insert('shortcutTokens', {
      userId,
      tokenHash,
      label,
      lastFour: token.slice(-4),
    })
    return { userId, tokenId }
  })
  return { userId, tokenId }
}

describe('POST /log (Apple Shortcuts endpoint)', () => {
  it('rejects requests with a missing token', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: ['Task A'] }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as LogResponse
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects requests with an unknown token', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': 'sk_not_a_real_token',
      },
      body: JSON.stringify({ tasks: ['Task A'] }),
    })

    expect(res.status).toBe(401)
  })

  it('rejects requests with an invalid JSON body', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: 'not-json',
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as LogResponse
    expect(body.error).toBe('Invalid JSON body')
  })

  it('rejects requests without a tasks array', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({ foo: 'bar' }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as LogResponse
    expect(body.error).toBe('tasks array required')
  })

  it('logs an entry for the token owner when given string tasks', async () => {
    const t = newTest()
    const { userId } = await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({
        tasks: ['Ship feature', 'Code review', 'Standup'],
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as LogResponse
    expect(body.ok).toBe(true)
    expect(body.tasks).toHaveLength(3)
    expect(body.totalHours).toMatch(/^\d{1,2}:\d{2}$/)
    for (const task of body.tasks!) {
      expect(task.label).toBeTypeOf('string')
      expect(task.hours).toMatch(/^\d{1,2}:\d{2}$/)
    }

    const stored = await t.run(async (ctx) => {
      return ctx.db
        .query('entries')
        .withIndex('by_userId_date', (q) => q.eq('userId', userId))
        .collect()
    })
    expect(stored).toHaveLength(1)
    expect(stored[0].source).toBe('shortcut')
    expect(stored[0].tasks).toHaveLength(3)
  })

  it('routes each token to its own owner', async () => {
    const t = newTest()
    const TOKEN_A = 'sk_aaa_user_a_token'
    const TOKEN_B = 'sk_bbb_user_b_token'
    const { userId: userIdA } = await setupUserWithToken(t, TOKEN_A, 'A')
    const { userId: userIdB } = await t.run(async (ctx) => {
      const uid = await ctx.db.insert('users', {
        name: 'User B',
        email: 'b@example.com',
      })
      await ctx.db.insert('shortcutTokens', {
        userId: uid,
        tokenHash: await sha256Hex(TOKEN_B),
        label: 'B',
        lastFour: TOKEN_B.slice(-4),
      })
      return { userId: uid }
    })

    const resA = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN_A,
      },
      body: JSON.stringify({ tasks: ['A task'] }),
    })
    expect(resA.status).toBe(200)

    const resB = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN_B,
      },
      body: JSON.stringify({ tasks: ['B task'] }),
    })
    expect(resB.status).toBe(200)

    const aEntries = await t.run((ctx) =>
      ctx.db
        .query('entries')
        .withIndex('by_userId_date', (q) => q.eq('userId', userIdA))
        .collect(),
    )
    const bEntries = await t.run((ctx) =>
      ctx.db
        .query('entries')
        .withIndex('by_userId_date', (q) => q.eq('userId', userIdB))
        .collect(),
    )

    expect(aEntries).toHaveLength(1)
    expect(bEntries).toHaveLength(1)
    expect(aEntries[0].tasks[0].label).toBe('A task')
    expect(bEntries[0].tasks[0].label).toBe('B task')
  })

  it('stamps lastUsedAt on the token that authorized the request', async () => {
    const t = newTest()
    const { tokenId } = await setupUserWithToken(t, TOKEN)

    const before = await t.run((ctx) => ctx.db.get(tokenId))
    expect(before?.lastUsedAt ?? null).toBeNull()

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({ tasks: ['Use token'] }),
    })
    expect(res.status).toBe(200)

    const after = await t.run((ctx) => ctx.db.get(tokenId))
    expect(typeof after?.lastUsedAt).toBe('number')
  })

  it('respects locked hours passed as task objects', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({
        tasks: [
          { label: 'Feature work', hours: '4:00' },
          { label: 'Meetings', hours: '2:00' },
          { label: 'Code review', hours: '2:00' },
        ],
      }),
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as LogResponse
    expect(body.ok).toBe(true)
    expect(body.totalHours).toBe('8:00')
    expect(body.tasks).toEqual([
      { label: 'Feature work', hours: '4:00' },
      { label: 'Meetings', hours: '2:00' },
      { label: 'Code review', hours: '2:00' },
    ])
  })

  it('returns a 400 when the locked total is outside the 7:30–8:00 band', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({
        tasks: [
          { label: 'Too short', hours: '1:00' },
          { label: 'Also short', hours: '1:00' },
        ],
      }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as LogResponse
    expect(body.error).toContain('7:30')
  })

  it('rate-limits a single token that bursts past the bucket capacity', async () => {
    const t = newTest()
    await setupUserWithToken(t, TOKEN)

    // logPerToken: token bucket, rate 30/min, capacity 10.
    // Drain the bucket with 10 back-to-back successful requests.
    for (let i = 0; i < 10; i++) {
      const res = await t.fetch('/log', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-shortcut-token': TOKEN,
        },
        body: JSON.stringify({ tasks: [`burst ${i}`] }),
      })
      expect(res.status).toBe(200)
    }

    // The 11th request against the same token should trip the bucket.
    const denied = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({ tasks: ['one too many'] }),
    })
    expect(denied.status).toBe(429)
    expect(denied.headers.get('retry-after')).toBeTruthy()
    const body = (await denied.json()) as LogResponse & {
      scope?: string
      retryAfterSeconds?: number
    }
    expect(body.error).toBe('Rate limit exceeded')
    expect(body.scope).toBe('token')
  })
})

