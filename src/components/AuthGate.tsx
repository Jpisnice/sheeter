import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[#8b8780]">
        <span className="font-mono text-xs">loading…</span>
      </div>
    )
  }
  if (!isAuthenticated) return null
  return <>{children}</>
}
