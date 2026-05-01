'use node'

import { v } from 'convex/values'
import ExcelJS from 'exceljs'
import { action } from './_generated/server'
import { api } from './_generated/api'
import {
  buildExportRows,
  buildExportSheetColumns,
} from '../src/lib/exportLayout'
import type { ExportEntryRow } from '../src/lib/exportLayout'
import { userPrefsToExportLayout } from './userPreferences'

export const generateExport = action({
  args: {
    mode: v.union(v.literal('week'), v.literal('month'), v.literal('range')),
    weekNo: v.optional(v.number()),
    year: v.optional(v.number()),
    month: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let entries: ExportEntryRow[] = []

    if (args.mode === 'week') {
      if (args.weekNo === undefined || args.year === undefined) {
        throw new Error('weekNo and year are required for week mode')
      }
      const rows = await ctx.runQuery(api.entries.getByWeek, {
        weekNo: args.weekNo,
        year: args.year,
      })
      entries = rows.map((e) => ({
        date: e.date,
        weekNo: e.weekNo,
        year: e.year,
        weekRange: e.weekRange,
        month: e.month,
        tasks: e.tasks,
        totalHours: e.totalHours,
      }))
    } else if (args.mode === 'month') {
      const month = args.month
      if (!month) {
        throw new Error('month is required for month mode')
      }
      const rows = await ctx.runQuery(api.entries.getByMonth, {
        month,
      })
      entries = rows.map((e) => ({
        date: e.date,
        weekNo: e.weekNo,
        year: e.year,
        weekRange: e.weekRange,
        month: e.month,
        tasks: e.tasks,
        totalHours: e.totalHours,
      }))
    } else {
      const from = args.from
      const to = args.to
      if (!from || !to) {
        throw new Error('from and to are required for range mode')
      }
      const rows = await ctx.runQuery(api.entries.getByDateRange, {
        from,
        to,
      })
      entries = rows.map((e) => ({
        date: e.date,
        weekNo: e.weekNo,
        year: e.year,
        weekRange: e.weekRange,
        month: e.month,
        tasks: e.tasks,
        totalHours: e.totalHours,
      }))
    }

    const prefsDto = await ctx.runQuery(api.userPreferences.get, {})
    const layout = userPrefsToExportLayout(prefsDto)
    const exportMode = args.mode === 'month' ? 'month' : 'week'
    const exportMonth = args.mode === 'month' ? args.month : undefined

    const rawRows = buildExportRows(
      entries,
      layout,
      exportMode,
      exportMonth,
    )
    const sheetColumns = buildExportSheetColumns(layout)

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Sheeter'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Timesheet')

    sheet.columns = sheetColumns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }))

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFF0EDE6' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A1A' },
    }
    headerRow.alignment = { vertical: 'middle' }

    for (const r of rawRows) {
      const row: Record<string, string | number> = {}
      for (const key of layout.exportColumns) {
        row[key] = r[key] ?? ''
      }
      sheet.addRow(row)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer).toString('base64')
  },
})
