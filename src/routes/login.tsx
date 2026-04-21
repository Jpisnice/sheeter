import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn } = useAuthActions()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.navigate({ to: '/dashboard' })
    }
  }, [isLoading, isAuthenticated, router])

  const onGitHub = async () => {
    setError(null)
    setBusy(true)
    try {
      await signIn('github', { redirectTo: '/dashboard' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
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

        <div className="rounded-xl border border-[#2a2826] bg-[#151515] p-6">
          <div className="mb-5 space-y-1.5 text-center">
            <h1 className="text-sm font-medium text-[#f0ede6]">Sign in</h1>
            <p className="text-xs text-[#8b8780]">
              Continue with your GitHub account.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onGitHub()}
            className="flex w-full items-center justify-center gap-2.5 rounded-md border border-[#2a2826] bg-[#0e0e0e] px-4 py-2.5 text-sm font-medium text-[#f0ede6] transition hover:border-[#c9964a] disabled:opacity-50"
          >
            <GitHubMark />
            <span>{busy ? 'Redirecting…' : 'Continue with GitHub'}</span>
          </button>
          {error ? (
            <p className="mt-4 text-center font-mono text-xs text-[#c97b4a]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function GitHubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .297C5.373.297 0 5.67 0 12.297c0 5.302 3.438 9.8 8.205 11.387.6.11.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.838 1.238 1.838 1.238 1.07 1.834 2.808 1.304 3.492.997.108-.776.42-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 016.003 0c2.29-1.552 3.296-1.23 3.296-1.23.655 1.653.243 2.873.12 3.176.77.84 1.234 1.91 1.234 3.22 0 4.61-2.807 5.624-5.48 5.92.43.372.814 1.103.814 2.222 0 1.604-.015 2.896-.015 3.286 0 .32.216.694.824.576C20.565 22.092 24 17.597 24 12.297 24 5.67 18.627.297 12 .297" />
    </svg>
  )
}
