import { describe, expect, it } from 'vitest'
import {
  formatChunkRange,
  formatMonthLongYear,
  getMonthWeekChunkForDate,
  getMonthWeekChunks,
  getISOWeek,
  getISOWeekYear,
  getWeekRange,
  getWeekdayDates,
  isWeekendDate,
  monthMenuOptions,
  monthString,
  stepMonthWeekChunk,
  todayString,
} from './weekUtils'

describe('getISOWeek', () => {
  it('returns ISO week numbers per the 8601 spec', () => {
    expect(getISOWeek(new Date(Date.UTC(2025, 0, 1)))).toBe(1)
    expect(getISOWeek(new Date(Date.UTC(2024, 11, 30)))).toBe(1)
    expect(getISOWeek(new Date(Date.UTC(2025, 3, 21)))).toBe(17)
    expect(getISOWeek(new Date(Date.UTC(2023, 0, 1)))).toBe(52)
  })
})

describe('getISOWeekYear', () => {
  it('returns ISO week-numbering year', () => {
    expect(getISOWeekYear(new Date(Date.UTC(2024, 11, 30)))).toBe(2025)
    expect(getISOWeekYear(new Date(Date.UTC(2023, 0, 1)))).toBe(2022)
  })
})

describe('getWeekRange', () => {
  it('returns Mon–Fri range for a given ISO week', () => {
    expect(getWeekRange(17, 2025)).toBe('Apr 21 – Apr 25')
    expect(getWeekRange(1, 2025)).toBe('Dec 30 – Jan 3')
  })
})

describe('getWeekdayDates', () => {
  it('returns 5 weekday date strings starting Monday', () => {
    expect(getWeekdayDates(17, 2025)).toEqual([
      '2025-04-21',
      '2025-04-22',
      '2025-04-23',
      '2025-04-24',
      '2025-04-25',
    ])
  })
  it('returns 7 dates when weekend is included', () => {
    expect(getWeekdayDates(17, 2025, true)).toEqual([
      '2025-04-21',
      '2025-04-22',
      '2025-04-23',
      '2025-04-24',
      '2025-04-25',
      '2025-04-26',
      '2025-04-27',
    ])
  })
})

describe('isWeekendDate', () => {
  it('flags Saturdays and Sundays', () => {
    expect(isWeekendDate('2025-04-26')).toBe(true)
    expect(isWeekendDate('2025-04-27')).toBe(true)
    expect(isWeekendDate('2025-04-21')).toBe(false)
    expect(isWeekendDate('2025-04-25')).toBe(false)
  })
})

describe('todayString / monthString', () => {
  it('produces YYYY-MM-DD / YYYY-MM format', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(monthString(0)).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('formatMonthLongYear', () => {
  it('formats a calendar month label', () => {
    expect(formatMonthLongYear('2026-01')).toBe('January 2026')
    expect(formatMonthLongYear('2025-12')).toBe('December 2025')
  })
})

describe('monthMenuOptions', () => {
  it('returns a contiguous YYYY-MM list', () => {
    const opts = monthMenuOptions(2, 1)
    expect(opts).toHaveLength(4)
    expect(opts[0]).toMatch(/^\d{4}-\d{2}$/)
    for (let i = 1; i < opts.length; i++) {
      const [py, pm] = opts[i - 1]!.split('-').map(Number)
      const d0 = new Date(py!, pm! - 1, 1)
      d0.setMonth(d0.getMonth() + 1)
      expect(`${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}`).toBe(
        opts[i],
      )
    }
  })
})

describe('month-clipped week chunks', () => {
  it('builds April 2026 chunks with partial edges', () => {
    const chunks = getMonthWeekChunks(2026, 3)
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toMatchObject({
      ordinal: 1,
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      dayCount: 5,
      isLeadingPartial: true,
      isTrailingPartial: false,
    })
    expect(chunks[4]).toMatchObject({
      ordinal: 5,
      startDate: '2026-04-27',
      endDate: '2026-04-30',
      dayCount: 4,
      isLeadingPartial: false,
      isTrailingPartial: true,
    })
  })

  it('builds May 2026 chunks with leading partial then full weeks', () => {
    const chunks = getMonthWeekChunks(2026, 4)
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toMatchObject({
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      dayCount: 3,
      isLeadingPartial: true,
    })
    expect(chunks[4]).toMatchObject({
      startDate: '2026-05-25',
      endDate: '2026-05-31',
      dayCount: 7,
      isTrailingPartial: false,
    })
  })

  it('builds February 2026 with single-day leading partial and trailing partial', () => {
    const chunks = getMonthWeekChunks(2026, 1)
    expect(chunks).toHaveLength(5)
    expect(chunks[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-01',
      dayCount: 1,
      isLeadingPartial: true,
    })
    expect(chunks[4]).toMatchObject({
      startDate: '2026-02-23',
      endDate: '2026-02-28',
      dayCount: 6,
      isTrailingPartial: true,
    })
  })

  it('steps across month boundaries by chunk ordinal', () => {
    const aprTail = getMonthWeekChunkForDate('2026-04-30')
    expect(aprTail.ordinal).toBe(5)
    const mayHead = stepMonthWeekChunk(aprTail, 1)
    expect(mayHead).toMatchObject({
      year: 2026,
      monthIndex: 4,
      ordinal: 1,
      startDate: '2026-05-01',
      endDate: '2026-05-03',
    })

    const back = stepMonthWeekChunk(mayHead, -1)
    expect(back).toMatchObject({
      year: 2026,
      monthIndex: 3,
      ordinal: 5,
      startDate: '2026-04-27',
      endDate: '2026-04-30',
    })
  })

  it('formats chunk range with weekday + month/day labels', () => {
    const c = getMonthWeekChunkForDate('2026-04-29')
    expect(formatChunkRange(c)).toBe('Mon Apr 27 – Thu Apr 30')
  })
})
