import { Link, useRouter } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'

export function TopBar() {
  const router = useRouter()
  const { signOut } = useAuthActions()
  const me = useQuery(api.entries.me)

  const onSignOut = async () => {
    await signOut()
    router.navigate({ to: '/login' })
  }

  return (
    <header className="border-b border-[#2a2826] bg-[#0e0e0e]/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <Link
          to="/dashboard"
          className="font-mono text-sm tracking-tight text-[#f0ede6] hover:text-[#c9964a]"
        >
          sheeter<span className="text-[#c9964a]">.</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link
            to="/dashboard"
            activeProps={{ className: 'text-[#c9964a]' }}
            className="text-[#8b8780] hover:text-[#f0ede6]"
          >
            Today
          </Link>
          <Link
            to="/history"
            activeProps={{ className: 'text-[#c9964a]' }}
            className="text-[#8b8780] hover:text-[#f0ede6]"
          >
            History
          </Link>
          <Link
            to="/settings"
            activeProps={{ className: 'text-[#c9964a]' }}
            className="text-[#8b8780] hover:text-[#f0ede6]"
          >
            Settings
          </Link>
          {me?.email ? (
            <span className="hidden text-xs text-[#8b8780] sm:inline">
              {me.email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md border border-[#2a2826] px-2.5 py-1 text-xs text-[#8b8780] hover:border-[#c9964a] hover:text-[#f0ede6]"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  )
}
