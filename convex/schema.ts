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
})
