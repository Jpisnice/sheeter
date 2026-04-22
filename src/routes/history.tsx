import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { Dialog } from '../components/Dialog'
import { TaskEditor } from '../components/TaskEditor'
import type { EditorSubmission } from '../components/TaskEditor'
import {
  formatShortDate,
  getISOWeek,
  getISOWeekYear,
  getWeekRange,
  getWeekdayDates,
  isWeekendDate,
  monthString,
} from '../lib/weekUtils'

export const Route = createFileRoute('/history')({ component: HistoryPage })

// Upper bound on the one-line task summary shown in a collapsed day row.
// Keeps the row a predictable width so the time badge on the right is always
// visible, no matter how wordy the tasks are. Picked to comfortably fit the
// 3xl max-width container at text-sm on a normal laptop screen. The expanded
// view (click to open the row) shows each task in full on its own line.
const MAX_SUMMARY_CHARS = 56
const TASK_SEPARATOR = ' · '

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  // Use a single ellipsis char to preserve a fixed visual width.
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function summarizeTasks(tasks: ReadonlyArray<{ label: string }>): string {
  return truncate(
    tasks.map((t) => t.label).join(TASK_SEPARATOR),
    MAX_SUMMARY_CHARS,
  )
}

function HistoryPage() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-3xl px-5 py-10">
          <History />
        </main>
      </div>
    </AuthGate>
  )
}

function stepWeek(
  weekNo: number,
  year: number,
  delta: number,
): { weekNo: number; year: number } {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (weekNo - 1) * 7)
  monday.setUTCDate(monday.getUTCDate() + delta * 7)
  return { weekNo: isoWeekFromUTC(monday), year: isoYearFromUTC(monday) }
}

function isoWeekFromUTC(target: Date): number {
  const t = new Date(target)
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function isoYearFromUTC(target: Date): number {
  const t = new Date(target)
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  return t.getUTCFullYear()
}

const WEEKEND_STORAGE_KEY = 'sheeter:showWeekend'

function History() {
  const [{ weekNo, year }, setWeek] = useState(() => ({
    weekNo: getISOWeek(),
    year: getISOWeekYear(),
  }))
  const [showWeekend, setShowWeekend] = useState<boolean>(false)
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEEKEND_STORAGE_KEY)
      if (raw === '1') setShowWeekend(true)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleWeekend = () => {
    setShowWeekend((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(WEEKEND_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const entries = useQuery(api.entries.getByWeek, { weekNo, year })
  const generate = useAction(api.export.generateExport)

  const weekRange = getWeekRange(weekNo, year)
  const byDate = useMemo(() => {
    const m = new Map<string, Doc<'entries'>>()
    for (const e of entries ?? []) m.set(e.date, e)
    return m
  }, [entries])

  const hasLoggedWeekend = useMemo(() => {
    for (const e of entries ?? []) if (isWeekendDate(e.date)) return true
    return false
  }, [entries])

  const dayList = useMemo(
    () => getWeekdayDates(weekNo, year, showWeekend || hasLoggedWeekend),
    [weekNo, year, showWeekend, hasLoggedWeekend],
  )

  const weeklyTotal = useMemo(() => {
    if (!entries) return null
    let mins = 0
    for (const e of entries) {
      const [h, mm] = e.totalHours.split(':').map(Number)
      mins += h * 60 + mm
    }
    const hh = Math.floor(mins / 60)
    const mm = mins % 60
    return `${hh}:${mm.toString().padStart(2, '0')}`
  }, [entries])

  const downloadBase64 = (base64: string, filename: string) => {
    if (typeof window === 'undefined') return
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportWeek = async () => {
    setError(null)
    setExporting(true)
    try {
      const b64 = await generate({ mode: 'week', weekNo, year })
      downloadBase64(
        b64,
        `sheeter-${year}-W${weekNo.toString().padStart(2, '0')}.xlsx`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const exportMonth = async () => {
    setError(null)
    setExporting(true)
    try {
      const b64 = await generate({ mode: 'month', month: monthString(0) })
      downloadBase64(b64, `sheeter-${monthString(0)}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setOpenDate(null)
            setEditingDate(null)
            setWeek(stepWeek(weekNo, year, -1))
          }}
          className="rounded-md border border-[#2a2826] px-3 py-1.5 font-mono text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
        >
          ← Prev
        </button>
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
            Week {weekNo.toString().padStart(2, '0')} · {year}
          </div>
          <div className="mt-1 text-sm">{weekRange}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenDate(null)
            setEditingDate(null)
            setWeek(stepWeek(weekNo, year, 1))
          }}
          className="rounded-md border border-[#2a2826] px-3 py-1.5 font-mono text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
        >
          Next →
        </button>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleWeekend}
          disabled={hasLoggedWeekend}
          title={
            hasLoggedWeekend
              ? 'Weekend shown automatically because entries exist'
              : showWeekend
                ? 'Hide Saturday & Sunday'
                : 'Show Saturday & Sunday'
          }
          className="rounded-md border border-[#2a2826] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] transition hover:border-[#c9964a] hover:text-[#f0ede6] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {showWeekend || hasLoggedWeekend ? '− Weekend' : '+ Weekend'}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#2a2826]">
        {dayList.map((dateStr) => (
          <DayRow
            key={dateStr}
            dateStr={dateStr}
            entry={byDate.get(dateStr) ?? null}
            isOpen={openDate === dateStr}
            isEditing={editingDate === dateStr}
            onToggleOpen={() => {
              setOpenDate((prev) => (prev === dateStr ? null : dateStr))
              if (editingDate !== dateStr) setEditingDate(null)
            }}
            onStartEdit={() => {
              setOpenDate(dateStr)
              setEditingDate(dateStr)
            }}
            onFinishEdit={() => setEditingDate(null)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[#2a2826] bg-[#151515] px-4 py-3 text-xs">
        <span className="font-mono uppercase tracking-[0.2em] text-[#8b8780]">
          Weekly total
        </span>
        <span className="font-mono text-sm text-[#c9964a]">
          {weeklyTotal ?? '—'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void exportWeek()}
          disabled={exporting || !entries?.length}
          className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#f0ede6] hover:border-[#c9964a] disabled:opacity-40"
        >
          {exporting ? 'Preparing…' : 'Export week XLSX'}
        </button>
        <button
          type="button"
          onClick={() => void exportMonth()}
          disabled={exporting}
          className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#f0ede6] hover:border-[#c9964a] disabled:opacity-40"
        >
          Export this month XLSX
        </button>
        {error ? (
          <span className="font-mono text-xs text-[#c97b4a]">{error}</span>
        ) : null}
      </div>
    </div>
  )
}

function DayRow({
  dateStr,
  entry,
  isOpen,
  isEditing,
  onToggleOpen,
  onStartEdit,
  onFinishEdit,
}: {
  dateStr: string
  entry: Doc<'entries'> | null
  isOpen: boolean
  isEditing: boolean
  onToggleOpen: () => void
  onStartEdit: () => void
  onFinishEdit: () => void
}) {
  const logEntry = useMutation(api.entries.logEntry)
  const deleteEntry = useMutation(api.entries.deleteEntry)
  const [busy, setBusy] = useState(false)
  const [viewDeleteOpen, setViewDeleteOpen] = useState(false)
  const weekend = isWeekendDate(dateStr)
  const prettyDate = formatShortDate(dateStr)

  const initialTasks = useMemo(
    () => entry?.tasks.map((t) => ({ label: t.label, hours: t.hours })) ?? [],
    [entry],
  )

  const handleSave = async (tasks: EditorSubmission) => {
    setBusy(true)
    try {
      await logEntry({ tasks, date: dateStr })
      onFinishEdit()
    } finally {
      setBusy(false)
    }
  }

  const performDelete = async () => {
    if (!entry) return
    setBusy(true)
    try {
      await deleteEntry({ entryId: entry._id })
      setViewDeleteOpen(false)
      onFinishEdit()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-[#2a2826] last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-3 text-sm">
        {/* min-w-0 is crucial: without it the inner truncate span would
            force the button to grow past its flex-1 share, squeezing the
            time column on the right out of view on long task labels. */}
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          title={entry ? entry.tasks.map((t) => t.label).join(TASK_SEPARATOR) : undefined}
        >
          <span className="shrink-0 text-[#4a4741]">
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <span
            className={`w-24 shrink-0 font-mono text-xs ${
              weekend ? 'text-[#6d6b67]' : 'text-[#8b8780]'
            }`}
          >
            {formatShortDate(dateStr)}
          </span>
          {entry ? (
            <span className="min-w-0 flex-1 truncate text-[#f0ede6]">
              {summarizeTasks(entry.tasks)}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[#4a4741]">
              — not logged —
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {entry?.source === 'shortcut' ? (
            <span className="rounded-sm bg-[#2a2826] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#c9964a]">
              shortcut
            </span>
          ) : null}
          <span className="w-10 text-right font-mono text-xs tabular-nums text-[#c9964a]">
            {entry?.totalHours ?? ''}
          </span>
          {!entry && !isEditing ? (
            <button
              type="button"
              onClick={onStartEdit}
              className="flex items-center gap-1 rounded-md border border-[#2a2826] px-2 py-1 font-mono text-[10px] text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
            >
              <Plus size={11} /> Log
            </button>
          ) : null}
        </div>
      </div>

      {isOpen && entry && !isEditing ? (
        <div className="border-t border-[#2a2826] bg-[#0e0e0e] px-4 py-3">
          <ul className="mb-3 space-y-1.5">
            {entry.tasks.map((t, idx) => (
              <li
                key={idx}
                className="flex justify-between font-mono text-xs text-[#8b8780]"
              >
                <span className="truncate pr-3 text-[#f0ede6]">{t.label}</span>
                <span>{t.hours}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStartEdit}
              className="rounded-md border border-[#2a2826] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setViewDeleteOpen(true)}
              disabled={busy}
              className="rounded-md border border-[#2a2826] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] hover:border-[#c97b4a] hover:text-[#c97b4a]"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {isEditing ? (
        <div className="border-t border-[#2a2826] bg-[#0e0e0e] px-4 py-4">
          <TaskEditor
            key={entry?._id ?? `new-${dateStr}`}
            initialTasks={initialTasks}
            isBusy={busy}
            primaryLabel={entry ? 'Save changes' : 'Log day'}
            onSubmit={handleSave}
            onCancel={onFinishEdit}
            onDelete={entry ? performDelete : undefined}
            autoFocus
            saveConfirmation={
              entry
                ? {
                    title: `Update ${prettyDate}?`,
                    description: `This will overwrite the existing entry for ${prettyDate}.`,
                    confirmLabel: 'Save changes',
                  }
                : {
                    title: `Log entry for ${prettyDate}?`,
                    description: `This will create a new entry for ${prettyDate}.`,
                    confirmLabel: 'Log day',
                  }
            }
            deleteConfirmation={{
              title: `Delete ${prettyDate}?`,
              description: `The entry for ${prettyDate} will be permanently removed.`,
              confirmLabel: 'Delete entry',
            }}
          />
        </div>
      ) : null}

      <Dialog
        open={viewDeleteOpen}
        variant="destructive"
        title={`Delete ${prettyDate}?`}
        description={`The entry for ${prettyDate} will be permanently removed.`}
        confirmLabel="Delete entry"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={performDelete}
        onCancel={() => {
          if (busy) return
          setViewDeleteOpen(false)
        }}
      />
    </div>
  )
}
