export function parseHMM(hmm: string): number {
  const trimmed = hmm.trim()
  const match = /^(\d+):([0-5]\d)$/.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid H:MM string: "${hmm}"`)
  }
  const hours = Number(match[1])
  const mins = Number(match[2])
  return hours * 60 + mins
}

// A single task can be at most 8 hours. The daily cap is also 8:00, so any
// single task wider than that is either a typo (e.g. 900 meant 9 minutes or a
// paste accident) or nonsense.
export const MAX_TASK_MINS = 480

// Accepts friendly user input and returns canonical "H:MM".
//   "3"     -> "3:00"    (1-2 pure digits = hours)
//   "08"    -> "8:00"
//   "3.5"   -> "3:30"    (decimal = fractional hours)
//   "1.25"  -> "1:15"
//   "230"   -> "2:30"    (3-4 pure digits = HMM / HHMM)
//   "500"   -> "5:00"
//   "1:30"  -> "1:30"
//   "1h30"  -> "1:30"
//   "  "    -> ""        (empty string passes through unchanged)
//
// Result is snapped to 15-minute increments and bounded to MAX_TASK_MINS.
// Throws on unparseable input or values outside [15, 480] minutes.
export function normalizeHoursInput(raw: string): string {
  const s = raw.trim()
  if (!s) return ''

  let mins: number
  const colon = /^(\d+):([0-5]\d)$/.exec(s)
  const hSep = /^(\d+)\s*h\s*(\d{1,2})?$/i.exec(s)
  // Decimal must contain a dot; pure digits are routed through `digitsOnly`
  // so we can apply the HMM/HHMM interpretation.
  const decimal = /^(\d+)\.(\d+)$/.exec(s)
  const digitsOnly = /^(\d{1,4})$/.exec(s)

  if (colon) {
    mins = Number(colon[1]) * 60 + Number(colon[2])
  } else if (hSep) {
    mins = Number(hSep[1]) * 60 + (hSep[2] ? Number(hSep[2]) : 0)
  } else if (decimal) {
    const hours = Number(decimal[1])
    const frac = Number(`0.${decimal[2]}`)
    mins = Math.round((hours + frac) * 60)
  } else if (digitsOnly) {
    const d = digitsOnly[1]
    if (d.length <= 2) {
      // "5" -> 5:00, "08" -> 8:00. Two digits always interpreted as hours
      // because the per-task cap is 8:00; any 2-digit minutes value would
      // either be < 15 (rejected below) or land above 0:59.
      mins = Number(d) * 60
    } else {
      // "230" -> 2:30, "1230" -> 12:30 (will exceed the cap). Last two digits
      // are minutes, everything before is hours.
      const h = Number(d.slice(0, d.length - 2))
      const m = Number(d.slice(d.length - 2))
      if (m >= 60) {
        throw new Error(`Invalid minutes "${m}" in "${raw}"`)
      }
      mins = h * 60 + m
    }
  } else {
    throw new Error(
      `Invalid hours "${raw}" (try H:MM or a number like 3, 2.5, or 230)`,
    )
  }

  mins = snapTo15(mins)
  if (mins < 15) {
    throw new Error('Each task needs at least 15 minutes')
  }
  if (mins > MAX_TASK_MINS) {
    throw new Error(`A task can be at most ${formatHMM(MAX_TASK_MINS)}`)
  }
  return formatHMM(mins)
}

// Keeps the hours input tidy while the user is typing: only digits and at
// most one colon, and never longer than "HH:MM" (5 chars). This runs on every
// keystroke so the input never contains garbage like letters or multiple
// colons, while still allowing intermediate states like "2" or "23" before
// the user lands on "2:30" / "230".
export function sanitizeHoursInput(raw: string): string {
  let s = raw.replace(/[^0-9:]/g, '')
  const first = s.indexOf(':')
  if (first !== -1) {
    s = s.slice(0, first + 1) + s.slice(first + 1).replace(/:/g, '')
  }
  if (s.length > 5) s = s.slice(0, 5)
  return s
}

export function formatHMM(totalMins: number): string {
  if (!Number.isFinite(totalMins) || totalMins < 0) {
    throw new Error(`Invalid total minutes: ${totalMins}`)
  }
  const rounded = Math.round(totalMins)
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function snapTo15(mins: number): number {
  return Math.round(mins / 15) * 15
}

export function randomBetween(min: number, max: number): number {
  if (max < min) {
    throw new Error('max must be >= min')
  }
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Distributes `totalMins` across `n` slots in 15-minute increments
// such that each slot gets at least 15 minutes and the sum equals totalMins.
// We start from an even (snapped) baseline, add ±15 min jitter per slot, and
// correct residue so the total is exact.
export function noisySplit(totalMins: number, n: number): Array<number> {
  if (n <= 0) {
    throw new Error('n must be >= 1')
  }
  if (totalMins < n * 15) {
    throw new Error(
      `totalMins (${totalMins}) too small to split into ${n} slots of >=15 mins`,
    )
  }
  if (totalMins % 15 !== 0) {
    throw new Error(`totalMins (${totalMins}) must be a multiple of 15`)
  }

  const totalSlots = totalMins / 15
  const baseSlots = Math.floor(totalSlots / n)
  let remainder = totalSlots - baseSlots * n

  const slots: Array<number> = new Array(n).fill(baseSlots)
  // Distribute remainder slots randomly
  while (remainder > 0) {
    const i = randomBetween(0, n - 1)
    slots[i] += 1
    remainder -= 1
  }

  // Add ±1 slot jitter in pairs (swap from one slot to another) to inject noise
  // without violating the minimum-1-slot (15 min) floor.
  const jitterRounds = Math.min(n, 3)
  for (let r = 0; r < jitterRounds; r++) {
    const from = randomBetween(0, n - 1)
    const to = randomBetween(0, n - 1)
    if (from === to) continue
    if (slots[from] > 1) {
      slots[from] -= 1
      slots[to] += 1
    }
  }

  return slots.map((s) => s * 15)
}
