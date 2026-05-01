const MONTH_ABBREV = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function toDateStringUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function parseDateStringUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function getISOWeek(date?: Date): number {
  const d = date ? new Date(date) : new Date()
  // Use UTC midnight copy to avoid DST issues
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )
  return weekNo
}

// Returns the ISO week-numbering year for a given Date (may differ from
// the calendar year near year boundaries).
export function getISOWeekYear(date?: Date): number {
  const d = date ? new Date(date) : new Date()
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  return target.getUTCFullYear()
}

/** Monday (UTC) of ISO week `weekNo` in ISO week-year `year`. */
export function getISOWeekMonday(weekNo: number, year: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1))
  const monday = new Date(week1Monday)
  monday.setUTCDate(week1Monday.getUTCDate() + (weekNo - 1) * 7)
  return monday
}

export function getWeekRange(weekNo: number, year: number): string {
  const monday = getISOWeekMonday(weekNo, year)
  const friday = new Date(monday)
  friday.setUTCDate(monday.getUTCDate() + 4)

  const monStr = `${MONTH_ABBREV[monday.getUTCMonth()]} ${monday.getUTCDate()}`
  const friStr = `${MONTH_ABBREV[friday.getUTCMonth()]} ${friday.getUTCDate()}`
  return `${monStr} – ${friStr}`
}

// Returns an array of "YYYY-MM-DD" strings for the given ISO week.
// By default returns Mon–Fri (5 days); pass `includeWeekend` for Mon–Sun.
export function getWeekdayDates(
  weekNo: number,
  year: number,
  includeWeekend: boolean = false,
): Array<string> {
  const monday = getISOWeekMonday(weekNo, year)
  const count = includeWeekend ? 7 : 5
  const out: Array<string> = []
  for (let i = 0; i < count; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    out.push(toDateStringUTC(d))
  }
  return out
}

export type MonthWeekChunk = {
  year: number
  monthIndex: number
  ordinal: number
  totalInMonth: number
  startDate: string
  endDate: string
  dayCount: number
  isLeadingPartial: boolean
  isTrailingPartial: boolean
  isoWeekNo: number
  isoYear: number
}

/** Mon-Sun chunks clipped to a calendar month, in date order. */
export function getMonthWeekChunks(
  year: number,
  monthIndex: number,
): MonthWeekChunk[] {
  const monthStart = new Date(Date.UTC(year, monthIndex, 1))
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0))
  const chunks: Array<{ start: Date; end: Date }> = []
  let cursor = new Date(monthStart)

  while (cursor <= monthEnd) {
    const start = new Date(cursor)
    const end = new Date(cursor)
    while (end < monthEnd && end.getUTCDay() !== 0) {
      end.setUTCDate(end.getUTCDate() + 1)
    }
    chunks.push({ start, end })
    cursor = new Date(end)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const totalInMonth = chunks.length
  return chunks.map(({ start, end }, idx) => {
    const dayCount = Math.round(
      (end.getTime() - start.getTime()) / 86400000,
    ) + 1
    const isoWeekNo = getISOWeek(start)
    const isoYear = getISOWeekYear(start)
    return {
      year,
      monthIndex,
      ordinal: idx + 1,
      totalInMonth,
      startDate: toDateStringUTC(start),
      endDate: toDateStringUTC(end),
      dayCount,
      isLeadingPartial: idx === 0 && start.getUTCDay() !== 1,
      isTrailingPartial: idx === totalInMonth - 1 && end.getUTCDay() !== 0,
      isoWeekNo,
      isoYear,
    }
  })
}

export function getMonthWeekChunkForDate(dateStr: string): MonthWeekChunk {
  const d = parseDateStringUTC(dateStr)
  const chunks = getMonthWeekChunks(d.getUTCFullYear(), d.getUTCMonth())
  const hit = chunks.find((c) => c.startDate <= dateStr && dateStr <= c.endDate)
  return hit ?? chunks[0]!
}

export function stepMonthWeekChunk(
  chunk: MonthWeekChunk,
  delta: number,
): MonthWeekChunk {
  if (delta === 0) return chunk
  const step = delta > 0 ? 1 : -1
  let remaining = Math.abs(delta)
  let current = chunk
  while (remaining > 0) {
    const nextOrdinal = current.ordinal + step
    if (nextOrdinal >= 1 && nextOrdinal <= current.totalInMonth) {
      const monthChunks = getMonthWeekChunks(current.year, current.monthIndex)
      current = monthChunks[nextOrdinal - 1]!
    } else {
      const nextMonthStart = new Date(
        Date.UTC(current.year, current.monthIndex + step, 1),
      )
      const monthChunks = getMonthWeekChunks(
        nextMonthStart.getUTCFullYear(),
        nextMonthStart.getUTCMonth(),
      )
      current = step > 0 ? monthChunks[0]! : monthChunks[monthChunks.length - 1]!
    }
    remaining--
  }
  return current
}

export function formatChunkRange(chunk: MonthWeekChunk): string {
  const start = parseDateStringUTC(chunk.startDate)
  const end = parseDateStringUTC(chunk.endDate)
  const startWk = start.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
  const endWk = end.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
  return `${startWk} ${MONTH_ABBREV[start.getUTCMonth()]} ${start.getUTCDate()} – ${endWk} ${MONTH_ABBREV[end.getUTCMonth()]} ${end.getUTCDate()}`
}

// Returns true if the given "YYYY-MM-DD" date falls on Saturday or Sunday.
export function isWeekendDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

export function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function monthString(offset: number = 0): string {
  const d = new Date()
  const target = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}`
}

/** e.g. "January 2026" for a `YYYY-MM` string (local calendar month). */
export function formatMonthLongYear(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return ym
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Consecutive `YYYY-MM` values for export/history month pickers. */
export function monthMenuOptions(
  pastMonths = 48,
  futureMonths = 3,
): string[] {
  const d = new Date()
  const out: string[] = []
  for (let i = -pastMonths; i <= futureMonths; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() + i, 1)
    out.push(`${t.getFullYear()}-${pad2(t.getMonth() + 1)}`)
  }
  return out
}

// Returns the full weekday name for a "YYYY-MM-DD" date string in local time.
export function weekdayName(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'long' })
}

// Pretty-print a "YYYY-MM-DD" date as e.g. "Mon Apr 21".
export function formatShortDate(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const wk = d.toLocaleDateString('en-US', { weekday: 'short' })
  return `${wk} ${MONTH_ABBREV[m - 1]} ${day}`
}

export function formatLongDate(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const wk = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${wk}, ${day} ${MONTH_ABBREV[m - 1]} ${y}`
}
