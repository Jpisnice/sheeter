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

export function getISOWeek(date?: Date): number {
  const d = date ? new Date(date) : new Date()
  // Use UTC midnight copy to avoid DST issues
  const target = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  )
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
  const target = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  )
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  return target.getUTCFullYear()
}

// Get the Date (in UTC) of the Monday of ISO week `weekNo` in `year`.
function getISOWeekMonday(weekNo: number, year: number): Date {
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

// Returns an array of 5 "YYYY-MM-DD" strings for Mon–Fri of the given ISO week.
export function getWeekdayDates(weekNo: number, year: number): Array<string> {
  const monday = getISOWeekMonday(weekNo, year)
  const out: Array<string> = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday)
    d.setUTCDate(monday.getUTCDate() + i)
    out.push(
      `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    )
  }
  return out
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
