import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { formatHMM, normalizeHoursInput, parseHMM } from '../lib/time'
import { Dialog } from './Dialog'

export type EditorTask = { label: string; hours: string }
export type EditorSubmission = Array<string | { label: string; hours: string }>

const MAX_TASKS = 3
const DAY_MIN_MINS = 450
const DAY_MAX_MINS = 480

type Row = { id: string; label: string; hours: string }

function makeId() {
  return Math.random().toString(36).slice(2, 10)
}

function rowsFromTasks(tasks: ReadonlyArray<EditorTask>): Array<Row> {
  return tasks.length
    ? tasks.map((t) => ({ id: makeId(), label: t.label, hours: t.hours }))
    : [{ id: makeId(), label: '', hours: '' }]
}

export function TaskEditor({
  initialTasks,
  isBusy,
  primaryLabel,
  secondaryLabel,
  onSubmit,
  onCancel,
  onDelete,
  autoFocus = false,
  saveConfirmation,
  deleteConfirmation,
}: {
  initialTasks: ReadonlyArray<EditorTask>
  isBusy: boolean
  primaryLabel: string
  secondaryLabel?: string
  onSubmit: (tasks: EditorSubmission) => void | Promise<void>
  onCancel?: () => void
  onDelete?: () => void | Promise<void>
  autoFocus?: boolean
  // When set, a confirmation dialog is shown before calling `onSubmit`.
  saveConfirmation?: { title: string; description?: string; confirmLabel?: string }
  // When set, a confirmation dialog is shown before calling `onDelete`.
  deleteConfirmation?: { title: string; description?: string; confirmLabel?: string }
}) {
  const [rows, setRows] = useState<Array<Row>>(() => rowsFromTasks(initialTasks))
  // IDs of rows whose `hours` the user has explicitly edited this session.
  // Rows in this set are treated as locked on submit; all others are sent as
  // auto so the backend can redistribute to fit the 7:30–8:00 daily window.
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const [warning, setWarning] = useState<string | null>(null)
  const [pendingSave, setPendingSave] = useState<EditorSubmission | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)

  useEffect(() => {
    setRows(rowsFromTasks(initialTasks))
    setLockedIds(new Set())
    setError(null)
    setWarning(null)
    setPendingSave(null)
    setConfirmingDelete(false)
  }, [initialTasks])

  const anyLocked = useMemo(() => {
    return rows.some(
      (r) => lockedIds.has(r.id) && r.hours.trim() !== '' && r.label.trim() !== '',
    )
  }, [rows, lockedIds])

  const isEffectivelyLocked = (r: Row): boolean => {
    if (r.label.trim() === '' || r.hours.trim() === '') return false
    if (anyLocked) return lockedIds.has(r.id)
    return true
  }

  const estimatedTotal = useMemo(() => {
    try {
      const labelled = rows.filter((r) => r.label.trim() !== '')
      if (labelled.length === 0) return null
      const lockedRows = labelled.filter(isEffectivelyLocked)
      const unlockedCount = labelled.length - lockedRows.length
      const lockedMins = lockedRows.reduce(
        (s, r) => s + parseHMM(normalizeHoursInput(r.hours)),
        0,
      )
      if (unlockedCount > 0) return null
      return formatHMM(lockedMins)
    } catch {
      return null
    }
  }, [rows, lockedIds, anyLocked])

  const updateLabel = (id: string, label: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)))
  }
  const updateHours = (id: string, hours: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, hours } : r)))
    setLockedIds((prev) => {
      const next = new Set(prev)
      if (hours.trim() === '') next.delete(id)
      else next.add(id)
      return next
    })
  }
  const addRow = () => {
    if (rows.length >= MAX_TASKS) return
    setRows((prev) => [...prev, { id: makeId(), label: '', hours: '' }])
  }
  const removeRow = (id: string) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((r) => r.id !== id))
    setLockedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const buildPayload = ():
    | { ok: true; payload: EditorSubmission; lockedMins: number; unlockedCount: number }
    | { ok: false; error: string } => {
    const labelled = rows.filter((r) => r.label.trim() !== '')
    if (labelled.length < 1 || labelled.length > MAX_TASKS) {
      return { ok: false, error: `Log between 1 and ${MAX_TASKS} tasks` }
    }
    let lockedMins = 0
    let unlockedCount = 0
    const payload: EditorSubmission = []
    for (const r of labelled) {
      const label = r.label.trim()
      const hours = r.hours.trim()
      if (!isEffectivelyLocked(r) || !hours) {
        unlockedCount++
        payload.push(label)
        continue
      }
      try {
        const canonical = normalizeHoursInput(hours)
        const mins = parseHMM(canonical)
        if (mins < 15) {
          return { ok: false, error: 'Each task needs at least 15 minutes' }
        }
        lockedMins += mins
        payload.push({ label, hours: canonical })
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Invalid hours' }
      }
    }
    return { ok: true, payload, lockedMins, unlockedCount }
  }

  const validateTotals = (
    lockedMins: number,
    unlockedCount: number,
  ): string | null => {
    if (unlockedCount === 0) {
      if (lockedMins < DAY_MIN_MINS) {
        return `The day totals ${formatHMM(lockedMins)}, which is below 7:30. Bump one or more tasks up, or clear a value so it auto-fills.`
      }
      if (lockedMins > DAY_MAX_MINS) {
        return `The day totals ${formatHMM(lockedMins)}, which is above 8:00. Trim one or more tasks down.`
      }
      return null
    }
    if (lockedMins + unlockedCount * 15 > DAY_MAX_MINS) {
      const ts = unlockedCount === 1 ? 'task' : 'tasks'
      return `Your locked hours (${formatHMM(lockedMins)}) leave no room for ${unlockedCount} auto ${ts}. Reduce a locked value or remove a task.`
    }
    return null
  }

  const submit = async (payload: EditorSubmission) => {
    setError(null)
    try {
      await onSubmit(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const handlePrimaryClick = () => {
    setError(null)
    setWarning(null)
    const built = buildPayload()
    if (!built.ok) {
      setError(built.error)
      return
    }
    const problem = validateTotals(built.lockedMins, built.unlockedCount)
    if (problem) {
      setWarning(problem)
      return
    }
    if (saveConfirmation) {
      setPendingSave(built.payload)
      return
    }
    void submit(built.payload)
  }

  const handleConfirmedSave = async () => {
    if (!pendingSave) return
    setConfirmBusy(true)
    try {
      await submit(pendingSave)
    } finally {
      setConfirmBusy(false)
      setPendingSave(null)
    }
  }

  const handleDeleteClick = () => {
    if (!onDelete) return
    if (deleteConfirmation) {
      setConfirmingDelete(true)
      return
    }
    void onDelete()
  }

  const handleConfirmedDelete = async () => {
    if (!onDelete) return
    setConfirmBusy(true)
    try {
      await onDelete()
    } finally {
      setConfirmBusy(false)
      setConfirmingDelete(false)
    }
  }

  const willRedistribute =
    anyLocked &&
    rows.some(
      (r) =>
        r.label.trim() !== '' &&
        r.hours.trim() !== '' &&
        !lockedIds.has(r.id),
    )

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((r, i) => {
          const dim =
            anyLocked && !lockedIds.has(r.id) && r.hours.trim() !== ''
          return (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-[#2a2826] bg-[#0e0e0e] p-2"
            >
              <input
                type="text"
                value={r.label}
                autoFocus={autoFocus && i === 0}
                onChange={(e) => updateLabel(r.id, e.target.value)}
                placeholder={`Task ${i + 1}`}
                className="bg-transparent px-1 py-1 text-sm outline-none placeholder:text-[#4a4741]"
              />
              <input
                type="text"
                value={r.hours}
                onChange={(e) => updateHours(r.id, e.target.value)}
                onBlur={() => {
                  const raw = r.hours.trim()
                  if (!raw) return
                  try {
                    const normalized = normalizeHoursInput(raw)
                    if (normalized !== r.hours) {
                      updateHours(r.id, normalized)
                    }
                  } catch {
                    /* keep user input */
                  }
                }}
                placeholder="auto"
                title={
                  dim
                    ? 'Will auto-adjust. Type to lock this value.'
                    : 'Leave blank for auto, or enter 3, 2.5, 1:30'
                }
                className={`w-16 rounded-md border bg-[#151515] px-2 py-1 text-center font-mono text-xs outline-none placeholder:text-[#4a4741] focus:border-[#c9964a] ${
                  dim
                    ? 'border-dashed border-[#2a2826] italic text-[#6d6b67]'
                    : 'border-[#2a2826]'
                }`}
              />
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                disabled={rows.length <= 1}
                aria-label="Remove task"
                className="flex h-6 w-6 items-center justify-center rounded text-[#8b8780] transition hover:text-[#c97b4a] disabled:opacity-30 disabled:hover:text-[#8b8780]"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= MAX_TASKS}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#2a2826] py-2 text-[11px] text-[#8b8780] transition hover:border-[#c9964a] hover:text-[#f0ede6] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#2a2826] disabled:hover:text-[#8b8780]"
        >
          <Plus size={11} /> Add task
          {rows.length >= MAX_TASKS ? ' (max 3)' : ''}
        </button>
      </div>

      {willRedistribute ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#8b8780]">
          Other tasks will auto-adjust to 7:30–8:00
        </p>
      ) : null}

      {error ? (
        <p className="font-mono text-xs text-[#c97b4a]">{error}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={handlePrimaryClick}
          className="flex flex-1 items-center justify-between rounded-md bg-[#c9964a] px-3 py-2 text-xs font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
        >
          <span>{isBusy ? 'Saving…' : primaryLabel}</span>
          <span className="font-mono">{estimatedTotal ?? 'auto'} hrs</span>
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="rounded-md border border-[#2a2826] px-3 py-2 text-xs text-[#8b8780] hover:text-[#f0ede6]"
          >
            {secondaryLabel ?? 'Cancel'}
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={isBusy}
            aria-label="Delete entry"
            title="Delete entry"
            className="rounded-md border border-[#2a2826] px-2.5 py-2 text-xs text-[#8b8780] hover:border-[#c97b4a] hover:text-[#c97b4a]"
          >
            Delete
          </button>
        ) : null}
      </div>

      <Dialog
        open={warning !== null}
        variant="warning"
        title="Day total is out of range"
        description={warning}
        confirmLabel="Got it"
        cancelLabel={null}
        onConfirm={() => setWarning(null)}
        onCancel={() => setWarning(null)}
      />

      <Dialog
        open={pendingSave !== null}
        title={saveConfirmation?.title ?? 'Save changes?'}
        description={saveConfirmation?.description}
        confirmLabel={saveConfirmation?.confirmLabel ?? 'Save changes'}
        cancelLabel="Cancel"
        busy={confirmBusy || isBusy}
        onConfirm={handleConfirmedSave}
        onCancel={() => {
          if (confirmBusy || isBusy) return
          setPendingSave(null)
        }}
      />

      <Dialog
        open={confirmingDelete}
        variant="destructive"
        title={deleteConfirmation?.title ?? 'Delete entry?'}
        description={deleteConfirmation?.description}
        confirmLabel={deleteConfirmation?.confirmLabel ?? 'Delete'}
        cancelLabel="Cancel"
        busy={confirmBusy || isBusy}
        onConfirm={handleConfirmedDelete}
        onCancel={() => {
          if (confirmBusy || isBusy) return
          setConfirmingDelete(false)
        }}
      />
    </div>
  )
}
