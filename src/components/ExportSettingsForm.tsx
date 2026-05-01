import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Check } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import {
  getISOWeek,
  getISOWeekYear,
  monthString,
} from '../lib/weekUtils'
import {
  EXPORT_COLUMN_KEYS,
  type ExportColumnKey,
} from '../lib/prefs'
import {
  buildExportRows,
  buildExportSheetColumns,
  resolveExportHeaders,
  type ExportEntryRow,
  type ExportLayoutPrefs,
  type WeekNoDisplayMode,
  type WeekRangeDisplayMode,
} from '../lib/exportLayout'
import { ExportPreviewTable } from './ExportPreviewTable'

const COLUMN_LABELS: Record<ExportColumnKey, string> = {
  weekNo: 'Week number',
  weekRange: 'Week range',
  date: 'Date',
  day: 'Weekday',
  task: 'Task / summary',
  hours: 'Hours',
  dayTotal: 'Total column',
}

export function ExportSettingsForm() {
  const prefs = useQuery(api.userPreferences.get)
  const patchExport = useMutation(api.userPreferences.patchExport)

  const [cols, setCols] = useState<Array<ExportColumnKey>>([
    ...EXPORT_COLUMN_KEYS,
  ])
  const [agg, setAgg] = useState<'none' | 'daily' | 'weekly'>('none')
  const [weekNoMode, setWeekNoMode] = useState<WeekNoDisplayMode>('iso')
  const [weekRangeMode, setWeekRangeMode] =
    useState<WeekRangeDisplayMode>('isoShort')
  const [headerDraft, setHeaderDraft] = useState<
    Partial<Record<ExportColumnKey, string>>
  >({})
  const [previewScope, setPreviewScope] = useState<'week' | 'month'>('week')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!prefs) return
    setCols([...prefs.exportColumns])
    setAgg(prefs.exportAggregation)
    setWeekNoMode(prefs.weekNoDisplayMode)
    setWeekRangeMode(prefs.weekRangeDisplayMode)
    setHeaderDraft({ ...(prefs.exportHeaderOverrides ?? {}) })
  }, [prefs])

  const weekNoPreview = getISOWeek()
  const yearPreview = getISOWeekYear()
  const monthPreview = monthString(0)

  const entriesWeek = useQuery(api.entries.getByWeek, {
    weekNo: weekNoPreview,
    year: yearPreview,
  })
  const entriesMonth = useQuery(api.entries.getByMonth, {
    month: monthPreview,
  })

  const toExportEntries = (
    rows: Doc<'entries'>[] | undefined,
  ): ExportEntryRow[] =>
    (rows ?? []).map((e) => ({
      date: e.date,
      weekNo: e.weekNo,
      year: e.year,
      weekRange: e.weekRange,
      month: e.month,
      tasks: e.tasks,
      totalHours: e.totalHours,
    }))

  const localLayout: ExportLayoutPrefs = useMemo(() => {
    const overrides: Partial<Record<ExportColumnKey, string>> = {}
    for (const k of cols) {
      const v = headerDraft[k]?.trim()
      if (v) overrides[k] = v
    }
    return {
      exportAggregation: agg,
      exportColumns: cols,
      weekNoDisplayMode: weekNoMode,
      weekRangeDisplayMode: weekRangeMode,
      exportHeaderOverrides:
        Object.keys(overrides).length > 0 ? overrides : undefined,
    }
  }, [agg, cols, weekNoMode, weekRangeMode, headerDraft])

  const previewTable = useMemo(() => {
    const entries =
      previewScope === 'week'
        ? toExportEntries(entriesWeek)
        : toExportEntries(entriesMonth)
    const exportMode = previewScope === 'month' ? 'month' : 'week'
    const exportMonth = previewScope === 'month' ? monthPreview : undefined
    const raw = buildExportRows(entries, localLayout, exportMode, exportMonth)
    const columns = buildExportSheetColumns(localLayout)
    const rows = raw.map((r) => {
      const out: Record<string, string> = {}
      for (const key of localLayout.exportColumns) {
        const v = r[key]
        out[key] = v === undefined || v === null ? '' : String(v)
      }
      return out
    })
    return { columns, rows }
  }, [
    previewScope,
    entriesWeek,
    entriesMonth,
    localLayout,
    monthPreview,
  ])

  const defaultHeaders = useMemo(
    () => resolveExportHeaders(cols, agg, undefined),
    [cols, agg],
  )

  const removeCol = (key: ExportColumnKey) => {
    setCols((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((c) => c !== key)
    })
  }

  const addCol = (key: ExportColumnKey) => {
    setCols((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }

  const moveCol = (index: number, dir: -1 | 1) => {
    setCols((prev) => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[index]
      next[index] = next[j]!
      next[j] = t
      return next
    })
  }

  const onSave = async () => {
    setError(null)
    setBusy(true)
    try {
      const overrides: Record<string, string> = {}
      for (const k of cols) {
        const v = headerDraft[k]?.trim()
        if (v) overrides[k] = v
      }
      await patchExport({
        exportColumns: cols,
        exportAggregation: agg,
        weekNoDisplayMode: weekNoMode,
        weekRangeDisplayMode: weekRangeMode,
        exportHeaderOverrides:
          Object.keys(overrides).length > 0 ? overrides : undefined,
      })
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
    <section className="space-y-8">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Export
        </div>
        <h1 className="mt-1 text-lg font-medium">Excel export layout</h1>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-[#8b8780]">
          Column order, labels, grouping, and how week numbers / ranges appear
          in the spreadsheet. Preview uses your real data for this week or this
          month.
        </p>
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Week number in month exports
        </div>
        <div className="space-y-2 text-xs text-[#8b8780]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="wn"
              className="accent-[#c9964a]"
              checked={weekNoMode === 'iso'}
              onChange={() => setWeekNoMode('iso')}
            />
            <span>
              <span className="text-[#f0ede6]">ISO week</span> — same as
              History (week 1–53 by year).
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="wn"
              className="accent-[#c9964a]"
              checked={weekNoMode === 'monthOrdinal'}
              onChange={() => setWeekNoMode('monthOrdinal')}
            />
            <span>
              <span className="text-[#f0ede6]">Month week 1–5</span> — 7-day
              chunks from the 1st of each entry&apos;s calendar month.
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Week / date range column
        </div>
        <div className="space-y-2 text-xs text-[#8b8780]">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="wr"
              className="accent-[#c9964a]"
              checked={weekRangeMode === 'isoShort'}
              onChange={() => setWeekRangeMode('isoShort')}
            />
            <span>
              <span className="text-[#f0ede6]">Short ISO workweek</span> — e.g.{' '}
              <code className="font-mono text-[#f0ede6]">Mar 17 – Mar 21</code>{' '}
              (stored range).
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="wr"
              className="accent-[#c9964a]"
              checked={weekRangeMode === 'euSlashIsoWeek'}
              onChange={() => setWeekRangeMode('euSlashIsoWeek')}
            />
            <span>
              <span className="text-[#f0ede6]">EU slash (ISO Mon–Fri)</span> —{' '}
              <code className="font-mono text-[#f0ede6]">
                17/03/2026 - 21/03/2026
              </code>
              .
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="wr"
              className="accent-[#c9964a]"
              checked={weekRangeMode === 'monthCalendarSpan'}
              onChange={() => setWeekRangeMode('monthCalendarSpan')}
            />
            <span>
              <span className="text-[#f0ede6]">Full calendar month</span> —{' '}
              <code className="font-mono text-[#f0ede6]">
                01/01/2026 - 31/01/2026
              </code>{' '}
              from each row&apos;s month.
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Row shape
        </div>
        <fieldset className="space-y-2">
          {(
            [
              ['none', 'Per task', 'One row per task (classic sheet).'],
              [
                'daily',
                'Per day',
                'One row per day; tasks combined in one cell.',
              ],
              ['weekly', 'Per week', 'One row per ISO week with summed hours.'],
            ] as const
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition ${
                agg === value
                  ? 'border-[#c9964a] bg-[#0e0e0e]'
                  : 'border-[#2a2826] hover:border-[#3d3a36]'
              }`}
            >
              <input
                type="radio"
                name="export-agg"
                className="mt-1 accent-[#c9964a]"
                checked={agg === value}
                onChange={() => setAgg(value)}
              />
              <span>
                <span className="block text-sm text-[#f0ede6]">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[#8b8780]">
                  {desc}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
          Columns (top = left in Excel)
        </div>
        <ul className="space-y-1.5">
          {cols.map((key, index) => {
            const defH = defaultHeaders.find((h) => h.key === key)
            return (
              <li
                key={key}
                className="rounded-md border border-[#2a2826] bg-[#0e0e0e] px-2 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#f0ede6]">
                    {COLUMN_LABELS[key]}
                  </span>
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      title="Move up"
                      disabled={index === 0}
                      onClick={() => moveCol(index, -1)}
                      className="rounded border border-[#2a2826] px-1.5 py-0.5 font-mono text-[10px] text-[#8b8780] hover:text-[#f0ede6] disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Move down"
                      disabled={index === cols.length - 1}
                      onClick={() => moveCol(index, 1)}
                      className="rounded border border-[#2a2826] px-1.5 py-0.5 font-mono text-[10px] text-[#8b8780] hover:text-[#f0ede6] disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      disabled={cols.length <= 1}
                      onClick={() => removeCol(key)}
                      className="ml-1 rounded border border-[#2a2826] px-1.5 py-0.5 font-mono text-[10px] text-[#8b8780] hover:border-[#c97b4a] hover:text-[#c97b4a] disabled:opacity-30"
                    >
                      ×
                    </button>
                  </span>
                </div>
                <div className="mt-2">
                  <label className="font-mono text-[9px] uppercase tracking-wider text-[#6d6b67]">
                    Header override (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder={defH?.header ?? key}
                    value={headerDraft[key] ?? ''}
                    onChange={(e) =>
                      setHeaderDraft((d) => ({
                        ...d,
                        [key]: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-[#2a2826] bg-[#151515] px-2 py-1 font-mono text-xs text-[#f0ede6] placeholder:text-[#4a4741] focus:border-[#c9964a] focus:outline-none"
                  />
                </div>
              </li>
            )
          })}
        </ul>
        {EXPORT_COLUMN_KEYS.some((k) => !cols.includes(k)) ? (
          <div className="mt-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
              Add column
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXPORT_COLUMN_KEYS.filter((k) => !cols.includes(k)).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => addCol(key)}
                  className="rounded-md border border-dashed border-[#2a2826] px-2 py-1 text-[11px] text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
                >
                  + {COLUMN_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-[#2a2826] bg-[#151515]/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8b8780]">
            Live preview
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreviewScope('week')}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                previewScope === 'week'
                  ? 'border-[#c9964a] text-[#c9964a]'
                  : 'border-[#2a2826] text-[#8b8780]'
              }`}
            >
              This ISO week
            </button>
            <button
              type="button"
              onClick={() => setPreviewScope('month')}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                previewScope === 'month'
                  ? 'border-[#c9964a] text-[#c9964a]'
                  : 'border-[#2a2826] text-[#8b8780]'
              }`}
            >
              This month
            </button>
          </div>
        </div>
        {entriesWeek === undefined || entriesMonth === undefined ? (
          <p className="font-mono text-xs text-[#8b8780]">loading preview…</p>
        ) : previewTable.rows.length === 0 ? (
          <p className="font-mono text-xs text-[#8b8780]">
            No entries for this range — try the other preview or log some days.
          </p>
        ) : (
          <ExportPreviewTable
            columns={previewTable.columns}
            rows={previewTable.rows}
            footer="Live data — reflects options above (including unsaved header text). Download from History uses saved settings."
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="flex items-center gap-2 rounded-md bg-[#c9964a] px-4 py-2 font-mono text-[10px] uppercase tracking-wider font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
        >
          {justSaved ? <Check size={14} /> : null}
          {busy ? 'Saving…' : justSaved ? 'Saved' : 'Save export settings'}
        </button>
        {error ? (
          <span className="font-mono text-xs text-[#c97b4a]">{error}</span>
        ) : null}
      </div>
    </section>
  )
}
