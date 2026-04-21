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

// Accepts friendly user input and returns canonical "H:MM".
//   "3"     -> "3:00"
//   "3.5"   -> "3:30"
//   "1.25"  -> "1:15"
//   "1:30"  -> "1:30"
//   "1h30"  -> "1:30"
//   "  "    -> ""      (empty string passes through unchanged)
// Result is snapped to 15-minute increments. Throws on unparseable input.
export function normalizeHoursInput(raw: string): string {
  const s = raw.trim()
  if (!s) return ''

  let mins: number
  const colon = /^(\d+):([0-5]\d)$/.exec(s)
  const hSep = /^(\d+)\s*h\s*(\d{1,2})?$/i.exec(s)
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(s)

  if (colon) {
    mins = Number(colon[1]) * 60 + Number(colon[2])
  } else if (hSep) {
    mins = Number(hSep[1]) * 60 + (hSep[2] ? Number(hSep[2]) : 0)
  } else if (decimal) {
    const hours = Number(decimal[1])
    const frac = decimal[2] ? Number(`0.${decimal[2]}`) : 0
    mins = Math.round((hours + frac) * 60)
  } else {
    throw new Error(`Invalid hours "${raw}" (try H:MM or a number like 3 or 2.5)`)
  }

  mins = snapTo15(mins)
  if (mins < 15) {
    throw new Error('Each task needs at least 15 minutes')
  }
  return formatHMM(mins)
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
