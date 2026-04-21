import { describe, expect, it } from 'vitest'
import {
  formatHMM,
  noisySplit,
  parseHMM,
  randomBetween,
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
