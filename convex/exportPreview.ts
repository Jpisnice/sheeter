import { ConvexError, v } from 'convex/values'
import { getAuthUserId } from '@convex-dev/auth/server'
import { query } from './_generated/server'
import {
  buildExportRows,
  buildExportSheetColumns,
} from '../src/lib/exportLayout'
import type { ExportEntryRow } from '../src/lib/exportLayout'
import {
  preferencesFromDbRow,
  userPrefsToExportLayout,
} from './userPreferences'

export const preview = query({
  args: {
    mode: v.union(v.literal('week'), v.literal('month')),
    weekNo: v.optional(v.number()),
    year: v.optional(v.number()),
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Not authenticated')

    let entries: ExportEntryRow[] = []

    if (args.mode === 'week') {
      if (args.weekNo === undefined || args.year === undefined) {
        throw new ConvexError('weekNo and year are required for week mode')
      }
      const rows = await ctx.db
        .query('entries')
        .withIndex('by_userId_week', (q) =>
          q
            .eq('userId', userId)
            .eq('year', args.year!)
            .eq('weekNo', args.weekNo!),
        )
        .collect()
      entries = rows
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({
          date: e.date,
          weekNo: e.weekNo,
          year: e.year,
          weekRange: e.weekRange,
          month: e.month,
          tasks: e.tasks,
          totalHours: e.totalHours,
        }))
    } else {
      const month = args.month
      if (!month) {
        throw new ConvexError('month is required for month mode')
      }
      const rows = await ctx.db
        .query('entries')
        .withIndex('by_userId_month', (q) =>
          q.eq('userId', userId).eq('month', month),
        )
        .collect()
      entries = rows
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({
          date: e.date,
          weekNo: e.weekNo,
          year: e.year,
          weekRange: e.weekRange,
          month: e.month,
          tasks: e.tasks,
          totalHours: e.totalHours,
        }))
    }

    const prefRow = await ctx.db
      .query('userPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    const prefsDto = preferencesFromDbRow(prefRow)
    const layout = userPrefsToExportLayout(prefsDto)
    const exportMode = args.mode === 'month' ? 'month' : 'week'
    const exportMonth = args.mode === 'month' ? args.month : undefined

    const rawRows = buildExportRows(
      entries,
      layout,
      exportMode,
      exportMonth,
    )
    const columns = buildExportSheetColumns(layout)

    const rows = rawRows.map((r) => {
      const out: Record<string, string> = {}
      for (const key of layout.exportColumns) {
        const v = r[key]
        out[key] = v === undefined || v === null ? '' : String(v)
      }
      return out
    })

    return { columns, rows }
  },
})
