import { createFileRoute, Link } from '@tanstack/react-router'
import { AuthGate } from '../components/AuthGate'
import { TopBar } from '../components/TopBar'
import { ExportSettingsForm } from '../components/ExportSettingsForm'

export const Route = createFileRoute('/settings/export')({
  component: SettingsExportPage,
})

function SettingsExportPage() {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar />
        <main className="mx-auto max-w-3xl px-5 py-10">
          <nav className="mb-8">
            <Link
              to="/settings"
              className="font-mono text-xs text-[#8b8780] hover:text-[#c9964a]"
            >
              ← Settings
            </Link>
          </nav>
          <ExportSettingsForm />
        </main>
      </div>
    </AuthGate>
  )
}
