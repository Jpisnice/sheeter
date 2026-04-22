import { describe, expect, it } from 'vitest'
import {
  formatHMM,
  noisySplit,
  normalizeHoursInput,
  parseHMM,
  randomBetween,
  sanitizeHoursInput,
  snapTo15,
} from './time'

describe('parseHMM / formatHMM', () => {
  it('parses H:MM strings', () => {
    expect(parseHMM('7:45')).toBe(465)
    expect(parseHMM('2:30')).toBe(150)
    expect(parseHMM('0:15')).toBe(15)
  })

  it('formats minutes as H:MM', () => {
    expect(formatHMM(465)).toBe('7:45')
    expect(formatHMM(150)).toBe('2:30')
    expect(formatHMM(0)).toBe('0:00')
  })

  it('rejects invalid strings', () => {
    expect(() => parseHMM('abc')).toThrow()
    expect(() => parseHMM('7:60')).toThrow()
  })
})

describe('snapTo15', () => {
  it('snaps to nearest 15 minute increment', () => {
    expect(snapTo15(167)).toBe(165)
    expect(snapTo15(173)).toBe(180)
    expect(snapTo15(465)).toBe(465)
  })
})

describe('randomBetween', () => {
  it('returns inclusive range', () => {
    for (let i = 0; i < 50; i++) {
      const r = randomBetween(450, 480)
      expect(r).toBeGreaterThanOrEqual(450)
      expect(r).toBeLessThanOrEqual(480)
    }
  })
})

describe('noisySplit', () => {
  it('sums to exactly totalMins and meets >= 15 min floor', () => {
    for (let i = 0; i < 50; i++) {
      const total = snapTo15(randomBetween(450, 480))
      for (const n of [1, 2, 3] as const) {
        const parts = noisySplit(total, n)
        expect(parts.length).toBe(n)
        expect(parts.reduce((s, p) => s + p, 0)).toBe(total)
        expect(parts.every((p) => p >= 15 && p % 15 === 0)).toBe(true)
      }
    }
  })

  it('throws when total is too small for required slots', () => {
    expect(() => noisySplit(15, 2)).toThrow()
  })
})

describe('normalizeHoursInput', () => {
  it('returns empty string for blank input', () => {
    expect(normalizeHoursInput('')).toBe('')
    expect(normalizeHoursInput('   ')).toBe('')
  })

  it('parses colon form', () => {
    expect(normalizeHoursInput('1:30')).toBe('1:30')
    expect(normalizeHoursInput('0:45')).toBe('0:45')
    expect(normalizeHoursInput('8:00')).toBe('8:00')
  })

  it('parses decimal hours', () => {
    expect(normalizeHoursInput('2.5')).toBe('2:30')
    expect(normalizeHoursInput('1.25')).toBe('1:15')
    expect(normalizeHoursInput('0.75')).toBe('0:45')
  })

  it('parses "NhMM" form', () => {
    expect(normalizeHoursInput('1h30')).toBe('1:30')
    expect(normalizeHoursInput('2h')).toBe('2:00')
  })

  it('treats 1-2 pure digits as hours', () => {
    expect(normalizeHoursInput('3')).toBe('3:00')
    expect(normalizeHoursInput('08')).toBe('8:00')
    expect(normalizeHoursInput('5')).toBe('5:00')
  })

  it('treats 3-4 pure digits as HMM / HHMM', () => {
    expect(normalizeHoursInput('230')).toBe('2:30')
    expect(normalizeHoursInput('500')).toBe('5:00')
    expect(normalizeHoursInput('800')).toBe('8:00')
    expect(normalizeHoursInput('045')).toBe('0:45')
  })

  it('snaps to 15-minute increments', () => {
    expect(normalizeHoursInput('1:07')).toBe('1:00')
    expect(normalizeHoursInput('1:08')).toBe('1:15')
    expect(normalizeHoursInput('1.1')).toBe('1:00')
  })

  it('rejects values above the 8:00 per-task cap', () => {
    expect(() => normalizeHoursInput('9:00')).toThrow(/at most 8:00/)
    expect(() => normalizeHoursInput('830')).toThrow(/at most 8:00/)
    expect(() => normalizeHoursInput('1230')).toThrow(/at most 8:00/)
    expect(() => normalizeHoursInput('10')).toThrow(/at most 8:00/)
  })

  it('rejects values below 15 minutes', () => {
    // 5 min snaps down to 0, which is below the 15-min floor.
    expect(() => normalizeHoursInput('0:05')).toThrow(/15 minutes/)
    expect(() => normalizeHoursInput('0.05')).toThrow(/15 minutes/)
  })

  it('rejects unparseable input', () => {
    expect(() => normalizeHoursInput('abc')).toThrow()
    expect(() => normalizeHoursInput('1:2:3')).toThrow()
    expect(() => normalizeHoursInput('1:99')).toThrow()
  })
})

describe('sanitizeHoursInput', () => {
  it('strips non-digit, non-colon characters', () => {
    expect(sanitizeHoursInput('a2b:3c0')).toBe('2:30')
    expect(sanitizeHoursInput('2h30')).toBe('230')
    expect(sanitizeHoursInput('2.5')).toBe('25')
  })

  it('keeps only the first colon', () => {
    expect(sanitizeHoursInput('1:2:3')).toBe('1:23')
    expect(sanitizeHoursInput(':::')).toBe(':')
  })

  it('caps length at 5 characters (HH:MM)', () => {
    expect(sanitizeHoursInput('12:3456')).toBe('12:34')
    expect(sanitizeHoursInput('123456')).toBe('12345')
  })

  it('passes typing-in-progress values through unchanged', () => {
    expect(sanitizeHoursInput('')).toBe('')
    expect(sanitizeHoursInput('2')).toBe('2')
    expect(sanitizeHoursInput('23')).toBe('23')
    expect(sanitizeHoursInput('2:')).toBe('2:')
    expect(sanitizeHoursInput('2:3')).toBe('2:3')
    expect(sanitizeHoursInput('2:30')).toBe('2:30')
  })
})
