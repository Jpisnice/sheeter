import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { WorkHoursForm } from '../components/WorkHoursForm'

export const Route = createFileRoute('/settings/hours')({
  component: SettingsHoursPage,
})

function SettingsHoursPage() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-2xl px-5 py-10">
          <nav className="mb-8">
            <Link
              to="/settings"
              className="font-mono text-xs text-[#8b8780] hover:text-[#c9964a]"
            >
              ← Settings
            </Link>
          </nav>
          <WorkHoursForm />
        </main>
      </div>
    </AuthGate>
  )
}
