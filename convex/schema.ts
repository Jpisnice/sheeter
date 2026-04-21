import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,

  entries: defineTable({
    userId: v.id('users'),
    date: v.string(),
    weekNo: v.number(),
    year: v.number(),
    weekRange: v.string(),
    month: v.string(),
    tasks: v.array(
      v.object({
        label: v.string(),
        hours: v.string(),
      }),
    ),
    totalHours: v.string(),
    source: v.optional(v.union(v.literal('web'), v.literal('shortcut'))),
  })
    .index('by_userId_date', ['userId', 'date'])
    .index('by_userId_week', ['userId', 'year', 'weekNo'])
    .index('by_userId_month', ['userId', 'month']),

  // One row per personal-access token that can call POST /log.
  // We never store the plaintext token — only its SHA-256 hex digest.
  shortcutTokens: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
    label: v.string(),
    lastFour: v.string(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_userId', ['userId'])
    .index('by_tokenHash', ['tokenHash']),
})
