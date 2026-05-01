import { formatHMM, parseHMM } from './time'
import type { ExportColumnKey } from './prefs'
import { getISOWeekMonday, getMonthWeekChunkForDate } from './weekUtils'

export type WeekNoDisplayMode = 'iso' | 'monthOrdinal'
export type WeekRangeDisplayMode =
  | 'isoShort'
  | 'euSlashIsoWeek'
  | 'monthCalendarSpan'

export type ExportAggregation = 'none' | 'daily' | 'weekly'

/** Prefs needed to shape export rows + headers (subset of user prefs). */
export type ExportLayoutPrefs = {
  exportAggregation: ExportAggregation
  exportColumns: Array<ExportColumnKey>
  weekNoDisplayMode: WeekNoDisplayMode
  weekRangeDisplayMode: WeekRangeDisplayMode
  exportHeaderOverrides?: Partial<Record<ExportColumnKey, string>>
}

export type ExportEntryRow = {
  date: string
  weekNo: number
  year: number
  weekRange: string
  month: string
  tasks: Array<{ label: string; hours: string }>
  totalHours: string
}

export const EXPORT_COL_WIDTH: Record<ExportColumnKey, number> = {
  weekNo: 10,
  weekRange: 22,
  date: 14,
  day: 12,
  task: 48,
  hours: 10,
  dayTotal: 14,
}

const DEFAULT_HEADER: Record<
  ExportColumnKey,
  { noneDaily: string; weekly: string }
> = {
  weekNo: { noneDaily: 'Week No', weekly: 'Week No' },
  weekRange: { noneDaily: 'Week Range', weekly: 'Week Range' },
  date: { noneDaily: 'Date', weekly: 'Date' },
  day: { noneDaily: 'Day', weekly: 'Day' },
  task: { noneDaily: 'Task', weekly: 'Summary' },
  hours: { noneDaily: 'Hours', weekly: 'Hours' },
  dayTotal: { noneDaily: 'Daily Total', weekly: 'Week Total' },
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Month-clipped ISO chunks ordinal: 1..N within the date's calendar month. */
export function monthWeekOrdinal(dateStr: string): number {
  return getMonthWeekChunkForDate(dateStr).ordinal
}

/** Mon–Fri of ISO week as `DD/MM/YYYY - DD/MM/YYYY`. */
export function formatEuSlashIsoWeek(weekNo: number, year: number): string {
  const monday = getISOWeekMonday(weekNo, year)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)
  const y1 = monday.getUTCFullYear()
  const m1 = monday.getUTCMonth() + 1
  const d1 = monday.getUTCDate()
  const y2 = friday.getUTCFullYear()
  const m2 = friday.getUTCMonth() + 1
  const d2 = friday.getUTCDate()
  return `${pad2(d1)}/${pad2(m1)}/${y1} - ${pad2(d2)}/${pad2(m2)}/${y2}`
}

/** First–last calendar day of `YYYY-MM` as `DD/MM/YYYY - DD/MM/YYYY`. */
export function monthCalendarSpan(monthYYYYMM: string): string {
  const parts = monthYYYYMM.split('-')
  if (parts.length < 2) return ''
  const y = Number(parts[0])
  const mo = Number(parts[1])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12)
    return ''
  const m0 = mo - 1
  const last = new Date(Date.UTC(y, m0 + 1, 0))
  const lastDay = last.getUTCDate()
  return `${pad2(1)}/${pad2(mo)}/${y} - ${pad2(lastDay)}/${pad2(mo)}/${y}`
}

function dayNameForDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
  })
}

export function formatWeekRangeForExport(
  entry: Pick<ExportEntryRow, 'weekNo' | 'year' | 'weekRange' | 'month' | 'date'>,
  mode: WeekRangeDisplayMode,
  exportMode: 'week' | 'month',
): string {
  if (mode === 'isoShort') return entry.weekRange
  if (mode === 'euSlashIsoWeek') {
    return formatEuSlashIsoWeek(entry.weekNo, entry.year)
  }
  // monthCalendarSpan
  const monthKey = exportMode === 'month' ? entry.month : entry.month
  return monthCalendarSpan(monthKey)
}

export function formatWeekNoForExport(
  entry: Pick<ExportEntryRow, 'date' | 'weekNo' | 'month'>,
  mode: WeekNoDisplayMode,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
): string {
  if (mode === 'iso' || exportMode === 'week') {
    return String(entry.weekNo)
  }
  if (exportMode === 'month' && exportMonth && entry.month !== exportMonth) {
    return String(entry.weekNo)
  }
  return String(monthWeekOrdinal(entry.date))
}

function sumHoursStrings(hours: ReadonlyArray<string>): number {
  return hours.reduce((s, h) => s + parseHMM(h), 0)
}

type RowMap = Record<string, string | number>

function decorateEntryFields(
  entry: ExportEntryRow,
  row: RowMap,
  showWeekMeta: boolean,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
  prefs: ExportLayoutPrefs,
): RowMap {
  if (!showWeekMeta) return row
  const next = { ...row }
  if ('weekNo' in next && next.weekNo !== '') {
    next.weekNo = formatWeekNoForExport(
      entry,
      prefs.weekNoDisplayMode,
      exportMode,
      exportMonth,
    )
  }
  if ('weekRange' in next && next.weekRange !== '') {
    next.weekRange = formatWeekRangeForExport(
      entry,
      prefs.weekRangeDisplayMode,
      exportMode,
    )
  }
  return next
}

export function buildRowsNone(
  entries: ExportEntryRow[],
  prefs: ExportLayoutPrefs,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
): RowMap[] {
  const rows: RowMap[] = []
  for (const entry of entries) {
    const dayName = dayNameForDate(entry.date)
    entry.tasks.forEach((task, i) => {
      const show = i === 0
      const base: RowMap = {
        weekNo: show ? entry.weekNo : '',
        weekRange: show ? entry.weekRange : '',
        date: show ? entry.date : '',
        day: show ? dayName : '',
        task: task.label,
        hours: task.hours,
        dayTotal: show ? entry.totalHours : '',
      }
      rows.push(
        decorateEntryFields(entry, base, show, exportMode, exportMonth, prefs),
      )
    })
  }
  return rows
}

export function buildRowsDaily(
  entries: ExportEntryRow[],
  prefs: ExportLayoutPrefs,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
): RowMap[] {
  return entries.map((entry) => {
    const base: RowMap = {
      weekNo: entry.weekNo,
      weekRange: entry.weekRange,
      date: entry.date,
      day: dayNameForDate(entry.date),
      task: entry.tasks.map((t) => `${t.label} (${t.hours})`).join(' · '),
      hours: '',
      dayTotal: entry.totalHours,
    }
    return decorateEntryFields(entry, base, true, exportMode, exportMonth, prefs)
  })
}

type WeeklyGroup = {
  weekNo: number
  weekRange: string
  year: number
  entries: ExportEntryRow[]
}

export function buildRowsWeekly(
  entries: ExportEntryRow[],
  prefs: ExportLayoutPrefs,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
): RowMap[] {
  const byKey = new Map<string, WeeklyGroup>()
  for (const e of entries) {
    const key = `${e.year}-W${e.weekNo}`
    const cur = byKey.get(key)
    if (cur) {
      cur.entries.push(e)
    } else {
      byKey.set(key, {
        weekNo: e.weekNo,
        weekRange: e.weekRange,
        year: e.year,
        entries: [e],
      })
    }
  }
  const sorted = [...byKey.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return a.weekNo - b.weekNo
  })
  return sorted.map((g) => {
    g.entries.sort((a, b) => a.date.localeCompare(b.date))
    const rep = g.entries[0]!
    const totalMins = sumHoursStrings(g.entries.map((e) => e.totalHours))
    const n = g.entries.length
    const base: RowMap = {
      weekNo: g.weekNo,
      weekRange: g.weekRange,
      date: '',
      day: '',
      task: `${n} logged day${n === 1 ? '' : 's'} in week`,
      hours: '',
      dayTotal: formatHMM(totalMins),
    }
    const synthetic: ExportEntryRow = {
      ...rep,
      weekNo: g.weekNo,
      weekRange: g.weekRange,
      year: g.year,
      date: rep.date,
      month: rep.month,
      tasks: rep.tasks,
      totalHours: formatHMM(totalMins),
    }
    return decorateEntryFields(
      synthetic,
      base,
      true,
      exportMode,
      exportMonth,
      prefs,
    )
  })
}

export function resolveDefaultHeader(
  key: ExportColumnKey,
  aggregation: ExportAggregation,
): string {
  const weekly = aggregation === 'weekly'
  const h = DEFAULT_HEADER[key]
  return weekly ? h.weekly : h.noneDaily
}

export function resolveExportHeaders(
  columns: Array<ExportColumnKey>,
  aggregation: ExportAggregation,
  overrides: Partial<Record<ExportColumnKey, string>> | undefined,
): Array<{ key: ExportColumnKey; header: string; width: number }> {
  const weekly = aggregation === 'weekly'
  return columns.map((key) => {
    const base = weekly
      ? DEFAULT_HEADER[key].weekly
      : DEFAULT_HEADER[key].noneDaily
    const o = overrides?.[key]?.trim()
    const header = o && o.length > 0 ? o : base
    return { key, header, width: EXPORT_COL_WIDTH[key] }
  })
}

export function buildExportRows(
  entries: ExportEntryRow[],
  prefs: ExportLayoutPrefs,
  exportMode: 'week' | 'month',
  exportMonth: string | undefined,
): RowMap[] {
  const agg = prefs.exportAggregation
  if (agg === 'daily') {
    return buildRowsDaily(entries, prefs, exportMode, exportMonth)
  }
  if (agg === 'weekly') {
    return buildRowsWeekly(entries, prefs, exportMode, exportMonth)
  }
  return buildRowsNone(entries, prefs, exportMode, exportMonth)
}

export function buildExportSheetColumns(
  prefs: ExportLayoutPrefs,
): Array<{ key: ExportColumnKey; header: string; width: number }> {
  return resolveExportHeaders(
    prefs.exportColumns,
    prefs.exportAggregation,
    prefs.exportHeaderOverrides,
  )
}
