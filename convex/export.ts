'use node'

import { v } from 'convex/values'
import ExcelJS from 'exceljs'
import { action } from './_generated/server'
import { api } from './_generated/api'

export const generateExport = action({
  args: {
    mode: v.union(v.literal('week'), v.literal('month')),
    weekNo: v.optional(v.number()),
    year: v.optional(v.number()),
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let entries: Array<{
      date: string
      weekNo: number
      weekRange: string
      tasks: Array<{ label: string; hours: string }>
      totalHours: string
    }> = []

    if (args.mode === 'week') {
      if (args.weekNo === undefined || args.year === undefined) {
        throw new Error('weekNo and year are required for week mode')
      }
      entries = await ctx.runQuery(api.entries.getByWeek, {
        weekNo: args.weekNo,
        year: args.year,
      })
    } else {
      if (!args.month) {
        throw new Error('month is required for month mode')
      }
      entries = await ctx.runQuery(api.entries.getByMonth, {
        month: args.month,
      })
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Sheeter'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Timesheet')

    sheet.columns = [
      { header: 'Week No', key: 'weekNo', width: 10 },
      { header: 'Week Range', key: 'weekRange', width: 22 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Day', key: 'day', width: 12 },
      { header: 'Task', key: 'task', width: 48 },
      { header: 'Hours', key: 'hours', width: 10 },
      { header: 'Daily Total', key: 'dayTotal', width: 14 },
    ]

    const header = sheet.getRow(1)
    header.font = { bold: true, color: { argb: 'FFF0EDE6' } }
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A1A' },
    }
    header.alignment = { vertical: 'middle' }

    for (const entry of entries) {
      const [y, m, d] = entry.date.split('-').map(Number)
      const dayName = new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'long',
      })
      entry.tasks.forEach((task, i) => {
        sheet.addRow({
          weekNo: i === 0 ? entry.weekNo : '',
          weekRange: i === 0 ? entry.weekRange : '',
          date: i === 0 ? entry.date : '',
          day: i === 0 ? dayName : '',
          task: task.label,
          hours: task.hours,
          dayTotal: i === 0 ? entry.totalHours : '',
        })
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer).toString('base64')
  },
})
