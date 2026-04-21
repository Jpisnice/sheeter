import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Check, Copy } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { TaskEditor } from '../components/TaskEditor'
import type { EditorSubmission } from '../components/TaskEditor'
import { formatLongDate, getISOWeek, todayString } from '../lib/weekUtils'

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

function Dashboard() {
  const today = useQuery(api.entries.getToday)
  const logEntry = useMutation(api.entries.logEntry)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const dateStr = todayString()
  const longDate = formatLongDate(dateStr)
  const weekNo = getISOWeek()

  const initialTasks = useMemo(
    () =>
      today?.tasks.map((t) => ({ label: t.label, hours: t.hours })) ?? [],
    [today],
  )

  const onSubmit = async (tasks: EditorSubmission) => {
    setBusy(true)
    setToast(null)
    try {
      const result = await logEntry({ tasks, date: dateStr })
      setToast(`Logged ${result.totalHours} hrs`)
      setTimeout(() => setToast(null), 2800)
    } finally {
      setBusy(false)
    }
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

      <TaskEditor
        key={today?._id ?? 'empty'}
        initialTasks={initialTasks}
        isBusy={busy}
        primaryLabel={isExisting ? 'Update day' : 'Log day'}
        onSubmit={onSubmit}
        autoFocus={!isExisting}
      />

      {toast ? (
        <p className="font-mono text-xs text-[#c9964a]">{toast}</p>
      ) : null}

      {today ? (
        <div className="relative rounded-lg border border-[#2a2826] bg-[#151515]/60 p-4 text-xs text-[#8b8780]">
          <CopyEntryButton
            date={longDate}
            totalHours={today.totalHours}
            tasks={today.tasks}
          />
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

function CopyEntryButton({
  date,
  totalHours,
  tasks,
}: {
  date: string
  totalHours: string
  tasks: ReadonlyArray<{ label: string; hours: string }>
}) {
  const [copied, setCopied] = useState(false)

  const formatted = useMemo(() => {
    const lines = [`${date} — ${totalHours} hrs`]
    for (const t of tasks) {
      lines.push(`• ${t.label} (${t.hours})`)
    }
    return lines.join('\n')
  }, [date, totalHours, tasks])

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = formatted
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      } catch {
        return
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      aria-label="Copy entry to clipboard"
      title={copied ? 'Copied' : 'Copy to clipboard'}
      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-[#8b8780] transition hover:text-[#f0ede6]"
    >
      {copied ? (
        <Check size={11} className="text-[#c9964a]" />
      ) : (
        <Copy size={11} />
      )}
    </button>
  )
}
