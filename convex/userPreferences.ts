import { ConvexError, v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import type { ExportLayoutPrefs } from '../src/lib/exportLayout'

export const DEFAULT_DAY_MIN_MINS = 450
export const DEFAULT_DAY_MAX_MINS = 480

export const EXPORT_AGGREGATION = v.union(
  v.literal('none'),
  v.literal('daily'),
  v.literal('weekly'),
)

export const WEEK_NO_DISPLAY = v.union(
  v.literal('iso'),
  v.literal('monthOrdinal'),
)

export const WEEK_RANGE_DISPLAY = v.union(
  v.literal('isoShort'),
  v.literal('euSlashIsoWeek'),
  v.literal('monthCalendarSpan'),
)

export const EXPORT_COLUMN_KEYS = [
  'weekNo',
  'weekRange',
  'date',
  'day',
  'task',
  'hours',
  'dayTotal',
] as const

export type ExportColumnKey = (typeof EXPORT_COLUMN_KEYS)[number]

export const DEFAULT_EXPORT_COLUMNS: Array<ExportColumnKey> = [
  ...EXPORT_COLUMN_KEYS,
]

const ABS_MIN_MINS = 60
const ABS_MAX_MINS = 720
const HEADER_OVERRIDE_MAX_LEN = 40

type DbReader = Pick<QueryCtx, 'db'>

/** Used by entries mutations and export action (via runQuery). */
export async function getDayBoundsForUser(
  ctx: DbReader,
  userId: Id<'users'>,
): Promise<{ dayMinMins: number; dayMaxMins: number }> {
  const row = await ctx.db
    .query('userPreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
  if (!row) {
    return {
      dayMinMins: DEFAULT_DAY_MIN_MINS,
      dayMaxMins: DEFAULT_DAY_MAX_MINS,
    }
  }
  return { dayMinMins: row.dayMinMins, dayMaxMins: row.dayMaxMins }
}

export type UserPreferencesDTO = {
  dayMinMins: number
  dayMaxMins: number
  exportColumns: Array<ExportColumnKey>
  exportAggregation: 'none' | 'daily' | 'weekly'
  weekNoDisplayMode: 'iso' | 'monthOrdinal'
  weekRangeDisplayMode:
    | 'isoShort'
    | 'euSlashIsoWeek'
    | 'monthCalendarSpan'
  exportHeaderOverrides?: Partial<Record<ExportColumnKey, string>>
}

function defaultDto(): UserPreferencesDTO {
  return {
    dayMinMins: DEFAULT_DAY_MIN_MINS,
    dayMaxMins: DEFAULT_DAY_MAX_MINS,
    exportColumns: [...DEFAULT_EXPORT_COLUMNS],
    exportAggregation: 'none',
    weekNoDisplayMode: 'iso',
    weekRangeDisplayMode: 'isoShort',
    exportHeaderOverrides: undefined,
  }
}

function normalizeExportColumns(
  cols: ReadonlyArray<string>,
): Array<ExportColumnKey> {
  const allowed = new Set<string>(EXPORT_COLUMN_KEYS)
  const seen = new Set<string>()
  const out: Array<ExportColumnKey> = []
  for (const c of cols) {
    if (!allowed.has(c) || seen.has(c)) continue
    seen.add(c)
    out.push(c as ExportColumnKey)
  }
  return out.length ? out : [...DEFAULT_EXPORT_COLUMNS]
}

function normalizeHeaderOverrides(
  raw: Record<string, string> | undefined,
): Partial<Record<ExportColumnKey, string>> | undefined {
  if (!raw) return undefined
  const allowed = new Set<string>(EXPORT_COLUMN_KEYS)
  const out: Partial<Record<ExportColumnKey, string>> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!allowed.has(k)) continue
    const t = v.trim().slice(0, HEADER_OVERRIDE_MAX_LEN)
    if (t.length > 0) out[k as ExportColumnKey] = t
  }
  return Object.keys(out).length ? out : undefined
}

function rowToDto(row: {
  dayMinMins: number
  dayMaxMins: number
  exportColumns: Array<string>
  exportAggregation: 'none' | 'daily' | 'weekly'
  weekNoDisplayMode?: 'iso' | 'monthOrdinal'
  weekRangeDisplayMode?:
    | 'isoShort'
    | 'euSlashIsoWeek'
    | 'monthCalendarSpan'
  exportHeaderOverrides?: Record<string, string>
}): UserPreferencesDTO {
  const base = defaultDto()
  return {
    dayMinMins: row.dayMinMins,
    dayMaxMins: row.dayMaxMins,
    exportColumns: normalizeExportColumns(row.exportColumns),
    exportAggregation: row.exportAggregation,
    weekNoDisplayMode: row.weekNoDisplayMode ?? base.weekNoDisplayMode,
    weekRangeDisplayMode:
      row.weekRangeDisplayMode ?? base.weekRangeDisplayMode,
    exportHeaderOverrides: normalizeHeaderOverrides(row.exportHeaderOverrides),
  }
}

export function userPrefsToExportLayout(p: UserPreferencesDTO): ExportLayoutPrefs {
  return {
    exportAggregation: p.exportAggregation,
    exportColumns: p.exportColumns,
    weekNoDisplayMode: p.weekNoDisplayMode,
    weekRangeDisplayMode: p.weekRangeDisplayMode,
    exportHeaderOverrides: p.exportHeaderOverrides,
  }
}

export function preferencesFromDbRow(
  row: Doc<'userPreferences'> | null,
): UserPreferencesDTO {
  if (!row) return defaultDto()
  return rowToDto(row)
}

export const get = query({
  args: {},
  handler: async (ctx): Promise<UserPreferencesDTO> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')
    const row = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    return preferencesFromDbRow(row)
  },
})

async function ensurePrefsRow(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<Id<'userPreferences'>> {
  const existing = await ctx.db
    .query('userPreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
  if (existing) return existing._id
  return await ctx.db.insert('userPreferences', {
    userId,
    dayMinMins: DEFAULT_DAY_MIN_MINS,
    dayMaxMins: DEFAULT_DAY_MAX_MINS,
    exportColumns: [...DEFAULT_EXPORT_COLUMNS],
    exportAggregation: 'none',
    weekNoDisplayMode: 'iso',
    weekRangeDisplayMode: 'isoShort',
  })
}

export const patchHours = mutation({
  args: {
    dayMinMins: v.number(),
    dayMaxMins: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')

    const min = Math.round(args.dayMinMins)
    const max = Math.round(args.dayMaxMins)
    if (min < ABS_MIN_MINS || max > ABS_MAX_MINS) {
      throw new ConvexError(
        `Day total range must stay between ${ABS_MIN_MINS} and ${ABS_MAX_MINS} minutes`,
      )
    }
    if (min > max) {
      throw new ConvexError('Minimum day total cannot exceed maximum')
    }

    const id = await ensurePrefsRow(ctx, userId)
    await ctx.db.patch(id, { dayMinMins: min, dayMaxMins: max })
    return id
  },
})

export const patchExport = mutation({
  args: {
    exportColumns: v.array(v.string()),
    exportAggregation: EXPORT_AGGREGATION,
    weekNoDisplayMode: WEEK_NO_DISPLAY,
    weekRangeDisplayMode: WEEK_RANGE_DISPLAY,
    exportHeaderOverrides: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')

    const cols = normalizeExportColumns(args.exportColumns)
    if (cols.length === 0) {
      throw new ConvexError('Select at least one export column')
    }

    const overrides = normalizeHeaderOverrides(args.exportHeaderOverrides)

    const id = await ensurePrefsRow(ctx, userId)
    await ctx.db.patch(id, {
      exportColumns: cols,
      exportAggregation: args.exportAggregation,
      weekNoDisplayMode: args.weekNoDisplayMode,
      weekRangeDisplayMode: args.weekRangeDisplayMode,
      exportHeaderOverrides: overrides ?? undefined,
    })
    return id
  },
})
