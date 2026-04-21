import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL as
  | string
  | undefined
if (!CONVEX_URL) {
  console.error('Missing env var VITE_CONVEX_URL')
}

export const convex = new ConvexReactClient(CONVEX_URL ?? '')

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
}
