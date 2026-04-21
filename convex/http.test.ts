/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const TOKEN = '123456'

type LogResponse = {
  ok?: boolean
  error?: string
  entryId?: string
  totalHours?: string
  tasks?: Array<{ label: string; hours: string }>
}

const savedEnv = {
  SHORTCUT_TOKEN: process.env.SHORTCUT_TOKEN,
  OWNER_USER_ID: process.env.OWNER_USER_ID,
}

beforeEach(() => {
  process.env.SHORTCUT_TOKEN = TOKEN
})

afterEach(() => {
  process.env.SHORTCUT_TOKEN = savedEnv.SHORTCUT_TOKEN
  process.env.OWNER_USER_ID = savedEnv.OWNER_USER_ID
})

async function setupOwner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    return ctx.db.insert('users', {
      name: 'Shortcut Owner',
      email: 'owner@example.com',
    })
  })
  process.env.OWNER_USER_ID = userId
  return userId
}

describe('POST /log (Apple Shortcuts endpoint)', () => {
  it('rejects requests with a missing token', async () => {
    const t = convexTest(schema, modules)
    await setupOwner(t)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks: ['Task A'] }),
    })

    expect(res.status).toBe(401)
    const body = (await res.json()) as LogResponse
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects requests with an incorrect token', async () => {
    const t = convexTest(schema, modules)
    await setupOwner(t)

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': 'not-the-right-token',
      },
      body: JSON.stringify({ tasks: ['Task A'] }),
    })

    expect(res.status).toBe(401)
  })

  it('rejects requests with an invalid JSON body', async () => {
    const t = convexTest(schema, modules)
    await setupOwner(t)

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
    const t = convexTest(schema, modules)
    await setupOwner(t)

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

  it('logs an entry for the configured owner when given string tasks', async () => {
    const t = convexTest(schema, modules)
    const ownerId = await setupOwner(t)

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
        .withIndex('by_userId_date', (q) => q.eq('userId', ownerId))
        .collect()
    })
    expect(stored).toHaveLength(1)
    expect(stored[0].source).toBe('shortcut')
    expect(stored[0].tasks).toHaveLength(3)
  })

  it('respects locked hours passed as task objects', async () => {
    const t = convexTest(schema, modules)
    await setupOwner(t)

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
    const t = convexTest(schema, modules)
    await setupOwner(t)

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

  it('returns a 400 when OWNER_USER_ID is not configured', async () => {
    const t = convexTest(schema, modules)
    await setupOwner(t)
    delete process.env.OWNER_USER_ID

    const res = await t.fetch('/log', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shortcut-token': TOKEN,
      },
      body: JSON.stringify({ tasks: ['Task A'] }),
    })

    expect(res.status).toBe(400)
    const body = (await res.json()) as LogResponse
    expect(body.error).toContain('OWNER_USER_ID')
  })
})
