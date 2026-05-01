import { describe, expect, it } from 'vitest'
import {
  buildExportRows,
  formatEuSlashIsoWeek,
  monthCalendarSpan,
  monthWeekOrdinal,
  resolveExportHeaders,
} from './exportLayout'
import type { ExportLayoutPrefs } from './exportLayout'
import type { ExportColumnKey } from './prefs'
import { EXPORT_COLUMN_KEYS } from './prefs'

const basePrefs = (): ExportLayoutPrefs => ({
  exportAggregation: 'none',
  exportColumns: [...EXPORT_COLUMN_KEYS],
  weekNoDisplayMode: 'iso',
  weekRangeDisplayMode: 'isoShort',
})

const entry = (
  date: string,
  opts: Partial<{
    weekNo: number
    year: number
    weekRange: string
    month: string
    tasks: Array<{ label: string; hours: string }>
    totalHours: string
  }> = {},
) => ({
  date,
  weekNo: opts.weekNo ?? 3,
  year: opts.year ?? 2026,
  weekRange: opts.weekRange ?? 'Jan 12 – Jan 16',
  month: opts.month ?? date.slice(0, 7),
  tasks: opts.tasks ?? [{ label: 'A', hours: '1:00' }],
  totalHours: opts.totalHours ?? '1:00',
})

describe('monthWeekOrdinal', () => {
  it('uses month-clipped iso chunk ordinals', () => {
    expect(monthWeekOrdinal('2026-04-01')).toBe(1)
    expect(monthWeekOrdinal('2026-04-06')).toBe(2)
    expect(monthWeekOrdinal('2026-04-30')).toBe(5)
    expect(monthWeekOrdinal('2026-02-01')).toBe(1)
    expect(monthWeekOrdinal('2026-02-02')).toBe(2)
  })
})

describe('monthCalendarSpan', () => {
  it('covers January 2026', () => {
    expect(monthCalendarSpan('2026-01')).toBe('01/01/2026 - 31/01/2026')
  })
})

describe('formatEuSlashIsoWeek', () => {
  it('formats Mon–Fri in EU order', () => {
    const s = formatEuSlashIsoWeek(3, 2026)
    expect(s).toMatch(/^\d{2}\/\d{2}\/2026 - \d{2}\/\d{2}\/2026$/)
  })
})

describe('resolveExportHeaders', () => {
  it('applies overrides', () => {
    const cols = ['task', 'hours'] as ExportColumnKey[]
    const h = resolveExportHeaders(cols, 'none', { task: 'Work item' })
    expect(h[0]?.header).toBe('Work item')
    expect(h[1]?.header).toBe('Hours')
  })

  it('uses weekly labels when aggregated', () => {
    const cols = ['task', 'dayTotal'] as ExportColumnKey[]
    const h = resolveExportHeaders(cols, 'weekly', {})
    expect(h[0]?.header).toBe('Summary')
    expect(h[1]?.header).toBe('Week Total')
  })
})

describe('buildExportRows month modes', () => {
  it('shows month ordinal for weekNo in month export when enabled', () => {
    const prefs: ExportLayoutPrefs = {
      ...basePrefs(),
      weekNoDisplayMode: 'monthOrdinal',
    }
    const rows = buildExportRows(
      [entry('2026-01-15')],
      prefs,
      'month',
      '2026-01',
    )
    expect(String(rows[0]?.weekNo)).toBe('3')
  })

  it('shows ISO week in week export mode even if monthOrdinal set', () => {
    const prefs: ExportLayoutPrefs = {
      ...basePrefs(),
      weekNoDisplayMode: 'monthOrdinal',
    }
    const rows = buildExportRows(
      [entry('2026-01-15', { weekNo: 4 })],
      prefs,
      'week',
      undefined,
    )
    expect(String(rows[0]?.weekNo)).toBe('4')
  })

  it('uses month calendar span for weekRange when enabled', () => {
    const prefs: ExportLayoutPrefs = {
      ...basePrefs(),
      weekRangeDisplayMode: 'monthCalendarSpan',
    }
    const rows = buildExportRows(
      [entry('2026-01-15')],
      prefs,
      'month',
      '2026-01',
    )
    expect(rows[0]?.weekRange).toBe('01/01/2026 - 31/01/2026')
  })
})
