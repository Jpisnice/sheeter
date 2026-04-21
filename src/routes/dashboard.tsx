import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { formatLongDate, getISOWeek, todayString } from '../lib/weekUtils'
import { formatHMM, parseHMM } from '../lib/time'

export const Route = createFileRoute('/dashboard')({ component: DashboardPage })

function DashboardPage() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-2xl px-5 py-10">
          <Dashboard />
        </main>
      </div>
    </AuthGate>
  )
}

type Row = { label: string; hours: string }

function emptyRows(): Array<Row> {
  return [{ label: '', hours: '' }]
}

function Dashboard() {
  const today = useQuery(api.entries.getToday)
  const logEntry = useMutation(api.entries.logEntry)

  const [rows, setRows] = useState<Array<Row>>(emptyRows)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (today && today.tasks.length) {
      setRows(today.tasks.map((t) => ({ label: t.label, hours: t.hours })))
    }
  }, [today])

  const dateStr = todayString()
  const longDate = formatLongDate(dateStr)
  const weekNo = getISOWeek()

  const estimatedTotal = useMemo(() => {
    try {
      const lockedMins = rows
        .filter((r) => r.hours.trim() !== '' && r.label.trim() !== '')
        .reduce((s, r) => s + parseHMM(r.hours.trim()), 0)
      const unlocked = rows.filter(
        (r) => r.label.trim() !== '' && r.hours.trim() === '',
      ).length
      if (unlocked === rows.filter((r) => r.label.trim()).length) {
        return null
      }
      if (unlocked === 0) return formatHMM(lockedMins)
      return null
    } catch {
      return null
    }
  }, [rows])

  const onSubmit = async () => {
    setError(null)
    setToast(null)
    const payload = rows
      .filter((r) => r.label.trim() !== '')
      .map((r) => {
        const label = r.label.trim()
        const hours = r.hours.trim()
        if (!hours) return label
        return { label, hours }
      })
    if (payload.length < 1 || payload.length > 3) {
      setError('Log between 1 and 3 tasks')
      return
    }
    setBusy(true)
    try {
      const result = await logEntry({ tasks: payload })
      setToast(`Logged ${result.totalHours} hrs`)
      setTimeout(() => setToast(null), 2800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log entry')
    } finally {
      setBusy(false)
    }
  }

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    if (rows.length >= 3) return
    setRows((prev) => [...prev, { label: '', hours: '' }])
  }

  const removeRow = (i: number) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  const isExisting = Boolean(today)

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
            {isExisting ? 'Logged' : 'Today'}
          </div>
          <h1 className="mt-1 text-lg font-medium">{longDate}</h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-[#2a2826] bg-[#151515] px-2.5 py-1 font-mono text-xs text-[#8b8780]">
          <span>W{weekNo.toString().padStart(2, '0')}</span>
          {today?.source === 'shortcut' ? (
            <span
              title="Logged via iPhone Shortcut"
              className="rounded-sm bg-[#2a2826] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[#c9964a]"
            >
              shortcut
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-[#2a2826] bg-[#151515] p-3"
          >
            <input
              type="text"
              value={r.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              placeholder={`Task ${i + 1}`}
              className="bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-[#4a4741]"
            />
            <input
              type="text"
              value={r.hours}
              onChange={(e) => updateRow(i, { hours: e.target.value })}
              placeholder="auto"
              className="w-20 rounded-md border border-[#2a2826] bg-[#0e0e0e] px-2 py-1.5 text-center font-mono text-sm outline-none placeholder:text-[#4a4741] focus:border-[#c9964a]"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length <= 1}
              className="h-7 w-7 rounded-md border border-[#2a2826] text-[#8b8780] transition hover:border-[#c97b4a] hover:text-[#c97b4a] disabled:opacity-30 disabled:hover:border-[#2a2826] disabled:hover:text-[#8b8780]"
              aria-label="Remove task"
            >
              −
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 3}
          className="w-full rounded-lg border border-dashed border-[#2a2826] py-2.5 text-xs text-[#8b8780] transition hover:border-[#c9964a] hover:text-[#f0ede6] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#2a2826] disabled:hover:text-[#8b8780]"
        >
          + Add task {rows.length >= 3 ? '(max 3)' : ''}
        </button>
      </div>

      <div className="space-y-2">
        {error ? (
          <p className="font-mono text-xs text-[#c97b4a]">{error}</p>
        ) : null}
        {toast ? (
          <p className="font-mono text-xs text-[#c9964a]">{toast}</p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSubmit()}
          className="flex w-full items-center justify-between rounded-lg bg-[#c9964a] px-4 py-3 text-sm font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
        >
          <span>
            {busy
              ? isExisting
                ? 'Updating…'
                : 'Logging…'
              : isExisting
                ? 'Update day'
                : 'Log day'}
          </span>
          <span className="font-mono text-xs">
            {estimatedTotal ?? 'auto'} hrs
          </span>
        </button>
      </div>

      {today ? (
        <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-4 text-xs text-[#8b8780]">
          <div className="mb-2 font-mono uppercase tracking-[0.2em]">
            Saved · {today.totalHours} hrs
          </div>
          <ul className="space-y-1">
            {today.tasks.map((t, idx) => (
              <li key={idx} className="flex justify-between font-mono">
                <span className="truncate pr-3 text-[#f0ede6]">{t.label}</span>
                <span>{t.hours}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
