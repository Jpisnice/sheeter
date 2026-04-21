import { ConvexError, v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import {
  formatHMM,
  noisySplit,
  parseHMM,
  randomBetween,
  snapTo15,
} from '../src/lib/time'
import {
  getISOWeek,
  getISOWeekYear,
  getWeekRange,
  monthString,
  todayString,
} from '../src/lib/weekUtils'

type InputTaskValidator =
  | string
  | { label: string; hours?: string | undefined }

type ResolvedTask = { label: string; hours: string }

const inputTaskValidator = v.union(
  v.string(),
  v.object({
    label: v.string(),
    hours: v.optional(v.string()),
  }),
)

const DAY_MIN = 450
const DAY_MAX = 480

function resolveHours(tasks: Array<InputTaskValidator>): Array<ResolvedTask> {
  if (tasks.length < 1 || tasks.length > 3) {
    throw new ConvexError('Tasks must be between 1 and 3')
  }

  type Normalized = { label: string; mins: number | null }
  const normalized: Array<Normalized> = tasks.map((t) => {
    if (typeof t === 'string') {
      const label = t.trim()
      if (!label) throw new ConvexError('Task label cannot be empty')
      return { label, mins: null }
    }
    const label = t.label.trim()
    if (!label) throw new ConvexError('Task label cannot be empty')
    if (t.hours == null || t.hours === '') {
      return { label, mins: null }
    }
    let parsed: number
    try {
      parsed = parseHMM(t.hours)
    } catch {
      throw new ConvexError(`Invalid hours format "${t.hours}" (expected H:MM)`)
    }
    if (parsed % 15 !== 0) {
      throw new ConvexError(
        `Hours must be a multiple of 15 minutes, got ${t.hours}`,
      )
    }
    if (parsed < 15) {
      throw new ConvexError('Each task needs at least 15 minutes')
    }
    return { label, mins: parsed }
  })

  const lockedCount = normalized.filter((n) => n.mins !== null).length
  const unlockedCount = normalized.length - lockedCount

  if (unlockedCount === normalized.length) {
    const totalMins = snapTo15(randomBetween(DAY_MIN, DAY_MAX))
    const split = noisySplit(totalMins, normalized.length)
    return normalized.map((n, i) => ({
      label: n.label,
      hours: formatHMM(split[i]),
    }))
  }

  if (lockedCount === normalized.length) {
    const totalMins = normalized.reduce((s, n) => s + (n.mins ?? 0), 0)
    if (totalMins < DAY_MIN || totalMins > DAY_MAX) {
      throw new ConvexError(
        `Total hours must be between 7:30 and 8:00. Got ${formatHMM(totalMins)}.`,
      )
    }
    return normalized.map((n) => ({
      label: n.label,
      hours: formatHMM(n.mins!),
    }))
  }

  const lockedMins = normalized.reduce((s, n) => s + (n.mins ?? 0), 0)
  const minTotal = Math.max(DAY_MIN, lockedMins + unlockedCount * 15)
  if (minTotal > DAY_MAX) {
    throw new ConvexError(
      `Locked hours (${formatHMM(lockedMins)}) leave no room for ${unlockedCount} auto task(s).`,
    )
  }
  const totalMins = snapTo15(randomBetween(minTotal, DAY_MAX))
  const remaining = totalMins - lockedMins
  const autoSplit = noisySplit(remaining, unlockedCount)
  let ai = 0
  return normalized.map((n) => {
    if (n.mins !== null) {
      return { label: n.label, hours: formatHMM(n.mins) }
    }
    const mins = autoSplit[ai++]
    return { label: n.label, hours: formatHMM(mins) }
  })
}

async function upsertEntry(
  ctx: MutationCtx,
  userId: Id<'users'>,
  resolvedTasks: Array<ResolvedTask>,
  source: 'web' | 'shortcut',
): Promise<{
  entryId: Id<'entries'>
  totalHours: string
  tasks: Array<ResolvedTask>
}> {
  const totalMins = resolvedTasks.reduce((s, t) => s + parseHMM(t.hours), 0)
  const totalHours = formatHMM(totalMins)

  const date = todayString()
  const now = new Date()
  const weekNo = getISOWeek(now)
  const year = getISOWeekYear(now)
  const weekRange = getWeekRange(weekNo, year)
  const month = monthString(0)

  const existing = await ctx.db
    .query('entries')
    .withIndex('by_userId_date', (q) =>
      q.eq('userId', userId).eq('date', date),
    )
    .unique()

  const payload = {
    userId,
    date,
    weekNo,
    year,
    weekRange,
    month,
    tasks: resolvedTasks,
    totalHours,
    source,
  }

  if (existing) {
    await ctx.db.replace(existing._id, payload)
    return { entryId: existing._id, totalHours, tasks: resolvedTasks }
  }
  const entryId = await ctx.db.insert('entries', payload)
  return { entryId, totalHours, tasks: resolvedTasks }
}

export const logEntry = mutation({
  args: { tasks: v.array(inputTaskValidator) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')

    const resolved = resolveHours(args.tasks)
    return upsertEntry(ctx, userId, resolved, 'web')
  },
})

export const logEntryFromShortcut = internalMutation({
  args: { tasks: v.array(inputTaskValidator) },
  handler: async (ctx, args) => {
    const ownerId = process.env.OWNER_USER_ID
    if (!ownerId) {
      throw new ConvexError('OWNER_USER_ID env var is not configured')
    }
    const userId = ownerId as Id<'users'>
    const ownerDoc = await ctx.db.get(userId)
    if (!ownerDoc) {
      throw new ConvexError('OWNER_USER_ID does not point to a valid user')
    }

    const resolved = resolveHours(args.tasks)
    return upsertEntry(ctx, userId, resolved, 'shortcut')
  },
})

async function requireUser(ctx: QueryCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('Not authenticated')
  return userId
}

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const date = todayString()
    return ctx.db
      .query('entries')
      .withIndex('by_userId_date', (q) =>
        q.eq('userId', userId).eq('date', date),
      )
      .unique()
  },
})

export const getByWeek = query({
  args: { weekNo: v.number(), year: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const rows = await ctx.db
      .query('entries')
      .withIndex('by_userId_week', (q) =>
        q.eq('userId', userId).eq('year', args.year).eq('weekNo', args.weekNo),
      )
      .collect()
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  },
})

export const getByMonth = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const rows = await ctx.db
      .query('entries')
      .withIndex('by_userId_month', (q) =>
        q.eq('userId', userId).eq('month', args.month),
      )
      .collect()
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  },
})

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    return { _id: user._id, email: user.email, name: user.name }
  },
})
