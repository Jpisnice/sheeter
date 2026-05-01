import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link, useRouterState } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { Dialog } from '../components/Dialog'
import { ExportPreviewTable } from '../components/ExportPreviewTable'
import { TaskEditor } from '../components/TaskEditor'
import type { EditorSubmission } from '../components/TaskEditor'
import {
  formatChunkRange,
  formatMonthLongYear,
  formatShortDate,
  getMonthWeekChunkForDate,
  monthMenuOptions,
  stepMonthWeekChunk,
  isWeekendDate,
  monthString,
  todayString,
  type MonthWeekChunk,
} from '../lib/weekUtils'
import { DEFAULT_DAY_MAX_MINS, DEFAULT_DAY_MIN_MINS } from '../lib/prefs'

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

function yyyymmFromChunk(chunk: MonthWeekChunk): string {
  return `${chunk.year}-${String(chunk.monthIndex + 1).padStart(2, '0')}`
}

function enumerateDateRange(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = new Date(Date.UTC(sy, sm - 1, sd))
  const end = new Date(Date.UTC(ey, em - 1, ed))
  const out: string[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

const WEEKEND_STORAGE_KEY = 'sheeter:showWeekend'

function History() {
  const [chunk, setChunk] = useState(() =>
    getMonthWeekChunkForDate(todayString()),
  )
  const [showWeekend, setShowWeekend] = useState<boolean>(false)
  const [openDate, setOpenDate] = useState<string | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<null | 'week' | 'month'>(null)
  const [exportMonthYm, setExportMonthYm] = useState(() => monthString(0))
  const exportSectionRef = useRef<HTMLElement>(null)
  const locationHash = useRouterState({ select: (s) => s.location.hash })

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEEKEND_STORAGE_KEY)
      if (raw === '1') setShowWeekend(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (locationHash !== '#export' || !exportSectionRef.current) return
    exportSectionRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [locationHash])

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

  const chunkMonth = yyyymmFromChunk(chunk)
  const monthEntries = useQuery(api.entries.getByMonth, { month: chunkMonth })
  const prefs = useQuery(api.userPreferences.get)
  const generate = useAction(api.export.generateExport)

  const previewArgs =
    previewMode === 'week'
      ? {
          mode: 'range' as const,
          from: chunk.startDate,
          to: chunk.endDate,
        }
      : previewMode === 'month'
        ? { mode: 'month' as const, month: exportMonthYm }
        : ('skip' as const)
  const exportPreview = useQuery(api.exportPreview.preview, previewArgs)
  const entries = useMemo(
    () =>
      (monthEntries ?? []).filter(
        (e) => e.date >= chunk.startDate && e.date <= chunk.endDate,
      ),
    [monthEntries, chunk.startDate, chunk.endDate],
  )
  const byDate = useMemo(() => {
    const m = new Map<string, Doc<'entries'>>()
    for (const e of entries ?? []) m.set(e.date, e)
    return m
  }, [entries])

  const hasLoggedWeekend = useMemo(() => {
    for (const e of entries ?? []) if (isWeekendDate(e.date)) return true
    return false
  }, [entries])

  const dayList = useMemo(() => {
    const dates = enumerateDateRange(chunk.startDate, chunk.endDate)
    return showWeekend || hasLoggedWeekend
      ? dates
      : dates.filter((d) => !isWeekendDate(d))
  }, [chunk.startDate, chunk.endDate, showWeekend, hasLoggedWeekend])

  const periodTotal = useMemo(() => {
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

  const exportPeriod = async () => {
    setError(null)
    setExporting(true)
    try {
      const b64 = await generate({
        mode: 'range',
        from: chunk.startDate,
        to: chunk.endDate,
      })
      downloadBase64(
        b64,
        `sheeter-${chunk.startDate}_to_${chunk.endDate}.xlsx`,
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
      const b64 = await generate({ mode: 'month', month: exportMonthYm })
      downloadBase64(b64, `sheeter-${exportMonthYm}.xlsx`)
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
            setChunk((prev) => stepMonthWeekChunk(prev, -1))
          }}
          className="rounded-md border border-[#2a2826] px-3 py-1.5 font-mono text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
        >
          ← Prev
        </button>
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
            {formatMonthLongYear(chunkMonth)} · Week {chunk.ordinal}/
            {chunk.totalInMonth}
          </div>
          <div className="mt-1 text-sm">
            {formatChunkRange(chunk)} · {chunk.dayCount}{' '}
            {chunk.dayCount === 1 ? 'day' : 'days'}
            {chunk.isLeadingPartial || chunk.isTrailingPartial
              ? ' · partial'
              : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenDate(null)
            setEditingDate(null)
            setChunk((prev) => stepMonthWeekChunk(prev, 1))
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
            dayMinMins={prefs?.dayMinMins ?? DEFAULT_DAY_MIN_MINS}
            dayMaxMins={prefs?.dayMaxMins ?? DEFAULT_DAY_MAX_MINS}
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
          Period total
        </span>
        <span className="font-mono text-sm text-[#c9964a]">
          {periodTotal ?? '—'}
        </span>
      </div>

      <section
        ref={exportSectionRef}
        id="export"
        aria-labelledby="history-export-heading"
        className="scroll-mt-6 rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5"
      >
        <h2
          id="history-export-heading"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]"
        >
          Export
        </h2>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-[#8b8780]">
          Preview matches your saved layout from{' '}
          <Link
            to="/settings/export"
            className="text-[#c9964a] underline decoration-[#2a2826] underline-offset-2 hover:decoration-[#c9964a]"
          >
            Settings → Export layout
          </Link>
          . Month exports use the calendar month you pick below.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c9964a]/90">
              Current period
            </div>
            <p className="mt-1 text-xs text-[#8b8780]">
              Exports exactly what is shown above ({chunk.startDate} to{' '}
              {chunk.endDate}).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode('week')}
                disabled={!entries?.length}
                className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6] disabled:opacity-40"
              >
                Preview this period
              </button>
              <button
                type="button"
                onClick={() => void exportPeriod()}
                disabled={exporting || !entries?.length}
                className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#f0ede6] hover:border-[#c9964a] disabled:opacity-40"
              >
                {exporting ? 'Preparing…' : 'Export this period XLSX'}
              </button>
            </div>
          </div>

          <div className="border-t border-[#2a2826] pt-6">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#c9964a]/90">
              Month
            </div>
            <p className="mt-1 text-xs text-[#8b8780]">
              Choose any month (past or a few ahead), then preview or download.
            </p>
            <label className="mt-3 block max-w-xs">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8b8780]">
                Calendar month
              </span>
              <select
                value={exportMonthYm}
                onChange={(e) => setExportMonthYm(e.target.value)}
                className="w-full rounded-md border border-[#2a2826] bg-[#0e0e0e] px-3 py-2 font-mono text-sm text-[#f0ede6] outline-none focus:border-[#c9964a]"
              >
                {monthMenuOptions().map((ym) => (
                  <option key={ym} value={ym}>
                    {formatMonthLongYear(ym)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode('month')}
                disabled={exporting}
                className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6] disabled:opacity-40"
              >
                Preview month
              </button>
              <button
                type="button"
                onClick={() => void exportMonth()}
                disabled={exporting}
                className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#f0ede6] hover:border-[#c9964a] disabled:opacity-40"
              >
                {exporting ? 'Preparing…' : 'Export month XLSX'}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-4 font-mono text-xs text-[#c97b4a]">{error}</p>
        ) : null}
      </section>

      {previewMode ? (
        <ExportPreviewDialog
          mode={previewMode}
          weekLabel={`${formatChunkRange(chunk)} (${chunk.startDate} to ${chunk.endDate})`}
          monthLabel={`${formatMonthLongYear(exportMonthYm)} (${exportMonthYm})`}
          preview={exportPreview}
          exporting={exporting}
          onClose={() => {
            if (exporting) return
            setPreviewMode(null)
          }}
          onDownload={async () => {
            setError(null)
            setExporting(true)
            try {
              if (previewMode === 'week') {
                const b64 = await generate({
                  mode: 'range',
                  from: chunk.startDate,
                  to: chunk.endDate,
                })
                downloadBase64(
                  b64,
                  `sheeter-${chunk.startDate}_to_${chunk.endDate}.xlsx`,
                )
              } else {
                const b64 = await generate({
                  mode: 'month',
                  month: exportMonthYm,
                })
                downloadBase64(b64, `sheeter-${exportMonthYm}.xlsx`)
              }
              setPreviewMode(null)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Export failed')
            } finally {
              setExporting(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ExportPreviewDialog({
  mode,
  weekLabel,
  monthLabel,
  preview,
  exporting,
  onClose,
  onDownload,
}: {
  mode: 'week' | 'month'
  weekLabel: string
  monthLabel: string
  preview:
    | { columns: Array<{ key: string; header: string; width: number }>; rows: Array<Record<string, string>> }
    | undefined
  exporting: boolean
  onClose: () => void
  onDownload: () => Promise<void>
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !exporting) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-[#2a2826] bg-[#151515] p-5 shadow-2xl">
        <h3 className="text-sm font-medium text-[#f0ede6]">
          Export preview — {mode === 'week' ? weekLabel : monthLabel}
        </h3>
        <p className="mt-1 text-xs text-[#8b8780]">
          Matches your saved export settings. Download when it looks right.
        </p>
        <div className="mt-4">
          {preview === undefined ? (
            <p className="font-mono text-xs text-[#8b8780]">Loading…</p>
          ) : preview.rows.length === 0 ? (
            <p className="font-mono text-xs text-[#8b8780]">
              No rows for this range.
            </p>
          ) : (
            <ExportPreviewTable
              columns={preview.columns}
              rows={preview.rows}
              footer="Same layout as the generated .xlsx file."
            />
          )}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#8b8780] hover:text-[#f0ede6] disabled:opacity-40"
          >
            Close
          </button>
          <button
            type="button"
            disabled={
              exporting || preview === undefined || preview.rows.length === 0
            }
            onClick={() => void onDownload()}
            className="rounded-md bg-[#c9964a] px-3 py-2 text-xs font-medium text-[#0e0e0e] hover:bg-[#d7a35a] disabled:opacity-40"
          >
            {exporting ? 'Preparing…' : 'Download XLSX'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DayRow({
  dateStr,
  entry,
  dayMinMins,
  dayMaxMins,
  isOpen,
  isEditing,
  onToggleOpen,
  onStartEdit,
  onFinishEdit,
}: {
  dateStr: string
  entry: Doc<'entries'> | null
  dayMinMins: number
  dayMaxMins: number
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
          title={
            entry
              ? entry.tasks.map((t) => t.label).join(TASK_SEPARATOR)
              : undefined
          }
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
            dayMinMins={dayMinMins}
            dayMaxMins={dayMaxMins}
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
