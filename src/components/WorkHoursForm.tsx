import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { formatHMM } from '../lib/time'
import {
  DEFAULT_DAY_MAX_MINS,
  DEFAULT_DAY_MIN_MINS,
} from '../lib/prefs'

const SLIDER_MIN = 60
const SLIDER_MAX = 720
const SLIDER_STEP = 15

function clampMins(n: number): number {
  const x = Math.round(n / SLIDER_STEP) * SLIDER_STEP
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, x))
}

function applyPair(
  nextMin: number,
  nextMax: number,
): { min: number; max: number } {
  let a = clampMins(nextMin)
  let b = clampMins(nextMax)
  if (a > b) [a, b] = [b, a]
  return { min: a, max: b }
}

export function WorkHoursForm() {
  const prefs = useQuery(api.userPreferences.get)
  const patchHours = useMutation(api.userPreferences.patchHours)

  const [dayMin, setDayMin] = useState(DEFAULT_DAY_MIN_MINS)
  const [dayMax, setDayMax] = useState(DEFAULT_DAY_MAX_MINS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!prefs) return
    setDayMin(prefs.dayMinMins)
    setDayMax(prefs.dayMaxMins)
  }, [prefs])

  const onChangeMin = (v: number) => {
    const { min, max } = applyPair(v, dayMax)
    setDayMin(min)
    setDayMax(max)
  }

  const onChangeMax = (v: number) => {
    const { min, max } = applyPair(dayMin, v)
    setDayMin(min)
    setDayMax(max)
  }

  const onSave = async () => {
    setError(null)
    setBusy(true)
    try {
      await patchHours({ dayMinMins: dayMin, dayMaxMins: dayMax })
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (prefs === undefined) {
    return (
      <p className="font-mono text-xs text-[#8b8780]">loading preferences…</p>
    )
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Work day total
        </div>
        <h1 className="mt-1 text-lg font-medium">Work hours</h1>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-[#8b8780]">
          Auto-filled hours and Shortcut logs stay within this band. Locked
          totals must fall inside it unless you leave at least one task on{' '}
          <span className="text-[#f0ede6]">auto</span>.
        </p>
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <PresetChip
            label="Standard"
            sub="7:30–8:00"
            onClick={() => {
              const p = applyPair(450, 480)
              setDayMin(p.min)
              setDayMax(p.max)
            }}
          />
          <PresetChip
            label="Flexible"
            sub="6:00–9:00"
            onClick={() => {
              const p = applyPair(360, 540)
              setDayMin(p.min)
              setDayMax(p.max)
            }}
          />
          <PresetChip
            label="Part-time"
            sub="4:00–6:00"
            onClick={() => {
              const p = applyPair(240, 360)
              setDayMin(p.min)
              setDayMax(p.max)
            }}
          />
        </div>

        <div className="space-y-5">
          <RangeRow
            label="Minimum"
            value={dayMin}
            onChange={onChangeMin}
            display={formatHMM(dayMin)}
          />
          <RangeRow
            label="Maximum"
            value={dayMax}
            onChange={onChangeMax}
            display={formatHMM(dayMax)}
          />
        </div>

        <div className="mt-4 rounded-md border border-[#2a2826] bg-[#0e0e0e] px-3 py-2 font-mono text-xs text-[#c9964a]">
          {formatHMM(dayMin)} – {formatHMM(dayMax)} ·{' '}
          <span className="text-[#8b8780]">allowed day total</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="flex items-center gap-2 rounded-md bg-[#c9964a] px-4 py-2 font-mono text-[10px] uppercase tracking-wider font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
        >
          {justSaved ? <Check size={14} /> : null}
          {busy ? 'Saving…' : justSaved ? 'Saved' : 'Save work hours'}
        </button>
        {error ? (
          <span className="font-mono text-xs text-[#c97b4a]">{error}</span>
        ) : null}
      </div>
    </section>
  )
}

function PresetChip({
  label,
  sub,
  onClick,
}: {
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[#2a2826] px-3 py-1.5 text-left transition hover:border-[#c9964a]"
    >
      <div className="text-xs text-[#f0ede6]">{label}</div>
      <div className="font-mono text-[10px] text-[#8b8780]">{sub}</div>
    </button>
  )
}

function RangeRow({
  label,
  value,
  onChange,
  display,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  display: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          {label}
        </span>
        <span className="font-mono text-sm text-[#c9964a]">{display}</span>
      </div>
      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#c9964a]"
      />
    </div>
  )
}
