import { describe, expect, it } from 'vitest'
import {
  getISOWeek,
  getISOWeekYear,
  getWeekRange,
  getWeekdayDates,
  isWeekendDate,
  monthString,
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
