/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { describe, expect, it } from 'vitest'
import schema from './schema'
import { api } from './_generated/api'

const modules = import.meta.glob('./**/*.*s')

function newTest() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert('users', {
      name: 'Token Owner',
      email: 'owner@example.com',
    }),
  )
}

function as(t: ReturnType<typeof convexTest>, userId: string) {
  // getAuthUserId() splits `subject` on `|` and returns the first segment,
  // so we fake a session for the given userId here.
  return t.withIdentity({ subject: `${userId}|test-session` })
}

describe('shortcutTokens.create', () => {
  it('issues a token the first time and returns the plaintext', async () => {
    const t = newTest()
    const userId = await seedUser(t)

    const result = await as(t, userId).mutation(api.shortcutTokens.create, {
      label: 'iPhone',
    })

    expect(result.label).toBe('iPhone')
    expect(result.token).toMatch(/^sk_[0-9a-f]{48}$/)
    expect(result.lastFour).toBe(result.token.slice(-4))

    const stored = await t.run(async (ctx) =>
      ctx.db
        .query('shortcutTokens')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect(),
    )
    expect(stored).toHaveLength(1)
    expect(stored[0].tokenHash).not.toContain(result.token)
    expect(stored[0].lastFour).toBe(result.lastFour)
  })

  it('rate-limits a user that creates tokens too quickly', async () => {
    const t = newTest()
    const userId = await seedUser(t)

    // createToken bucket: fixed window, 5/hour per user.
    for (let i = 0; i < 5; i++) {
      await as(t, userId).mutation(api.shortcutTokens.create, {
        label: `slot-${i}`,
      })
    }

    // The 6th create within the same window should throw a ConvexError
    // tagged by the rate limiter rather than inserting a row.
    await expect(
      as(t, userId).mutation(api.shortcutTokens.create, { label: 'slot-6' }),
    ).rejects.toThrow(/Too many tokens created recently/)

    const stored = await t.run(async (ctx) =>
      ctx.db
        .query('shortcutTokens')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect(),
    )
    expect(stored).toHaveLength(5)
  })

  it('scopes the createToken bucket per user', async () => {
    const t = newTest()
    const userA = await seedUser(t)
    const userB = await t.run((ctx) =>
      ctx.db.insert('users', { name: 'User B', email: 'b@example.com' }),
    )

    for (let i = 0; i < 5; i++) {
      await as(t, userA).mutation(api.shortcutTokens.create, {
        label: `a-${i}`,
      })
    }

    // User B's bucket is independent, so their first create still succeeds.
    const result = await as(t, userB).mutation(api.shortcutTokens.create, {
      label: 'b-1',
    })
    expect(result.token).toMatch(/^sk_/)
  })
})
