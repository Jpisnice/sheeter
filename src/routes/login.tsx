import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'

export const Route = createFileRoute('/login')({ component: LoginPage })

type Step = 'email' | 'otp'

function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn } = useAuthActions()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.navigate({ to: '/dashboard' })
    }
  }, [isLoading, isAuthenticated, router])

  const requestCode = async () => {
    setError(null)
    if (!email.trim()) {
      setError('Enter your email')
      return
    }
    setBusy(true)
    try {
      await signIn('resend-otp', { email: email.trim() })
      setStep('otp')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send code')
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    setError(null)
    if (!code.trim()) {
      setError('Enter the 6-digit code')
      return
    }
    setBusy(true)
    try {
      await signIn('resend-otp', { email: email.trim(), code: code.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-mono text-sm tracking-tight text-[#f0ede6]">
            sheeter<span className="text-[#c9964a]">.</span>
          </div>
          <p className="mt-1 text-xs text-[#8b8780]">
            a quiet little timesheet logger
          </p>
        </div>

        <div className="rounded-xl border border-[#2a2826] bg-[#151515] p-6 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset]">
          {step === 'email' ? (
            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8b8780]">
                  Email
                </label>
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void requestCode()
                  }}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-[#2a2826] bg-[#0e0e0e] px-3 py-2 text-sm outline-none placeholder:text-[#4a4741] focus:border-[#c9964a]"
                />
              </div>
              {error ? (
                <p className="font-mono text-xs text-[#c97b4a]">{error}</p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void requestCode()}
                className="w-full rounded-md bg-[#c9964a] py-2 text-sm font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="mb-4 text-xs text-[#8b8780]">
                  We sent a 6-digit code to{' '}
                  <span className="text-[#f0ede6]">{email}</span>.
                </p>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8b8780]">
                  Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void verifyCode()
                  }}
                  placeholder="000000"
                  className="w-full rounded-md border border-[#2a2826] bg-[#0e0e0e] px-3 py-2 text-center font-mono text-lg tracking-[0.4em] outline-none placeholder:text-[#4a4741] focus:border-[#c9964a]"
                />
              </div>
              {error ? (
                <p className="font-mono text-xs text-[#c97b4a]">{error}</p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void verifyCode()}
                className="w-full rounded-md bg-[#c9964a] py-2 text-sm font-medium text-[#0e0e0e] transition hover:bg-[#d7a35a] disabled:opacity-50"
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                }}
                className="w-full text-xs text-[#8b8780] hover:text-[#f0ede6]"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
