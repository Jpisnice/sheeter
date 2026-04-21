import { useEffect } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const router = useRouter()
  const { isLoading, isAuthenticated } = useConvexAuth()

  useEffect(() => {
    if (isLoading) return
    router.navigate({ to: isAuthenticated ? '/dashboard' : '/login' })
  }, [isLoading, isAuthenticated, router])

  return (
    <div className="flex min-h-screen items-center justify-center text-[#8b8780]">
      <span className="font-mono text-xs">redirecting…</span>
    </div>
  )
}
