import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export type DialogVariant = 'default' | 'warning' | 'destructive'

export function Dialog({
  open,
  title,
  description,
  variant = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  variant?: DialogVariant
  confirmLabel?: string
  // Set to null to hide the cancel button entirely.
  cancelLabel?: string | null
  onConfirm?: () => void | Promise<void>
  onCancel: () => void
  busy?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onCancel])

  if (!open) return null

  const confirmClass =
    variant === 'destructive'
      ? 'bg-[#c97b4a] text-[#0e0e0e] hover:bg-[#d48a5a]'
      : 'bg-[#c9964a] text-[#0e0e0e] hover:bg-[#d7a35a]'

  const iconClass =
    variant === 'destructive'
      ? 'text-[#c97b4a]'
      : variant === 'warning'
        ? 'text-[#c9964a]'
        : 'text-[#8b8780]'

  const showIcon = variant === 'warning' || variant === 'destructive'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div className="w-full max-w-sm rounded-lg border border-[#2a2826] bg-[#151515] p-5 shadow-2xl">
        <div className="mb-2 flex items-start gap-2.5">
          {showIcon ? (
            <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${iconClass}`} />
          ) : null}
          <h3 className="text-sm font-medium text-[#f0ede6]">{title}</h3>
        </div>
        {description ? (
          <div
            className={`mb-4 text-xs leading-relaxed text-[#8b8780] ${showIcon ? 'pl-[26px]' : ''}`}
          >
            {description}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {cancelLabel !== null ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-[#2a2826] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8b8780] hover:text-[#f0ede6] disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          ) : null}
          {onConfirm ? (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={busy}
              className={`rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-medium transition disabled:opacity-50 ${confirmClass}`}
              autoFocus
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
