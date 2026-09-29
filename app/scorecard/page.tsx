import AppHeader from '@/app/components/AppHeader'
import ScorecardWorkspace from '@/app/scorecard/ScorecardWorkspace'

export default function ScorecardPage() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <ScorecardWorkspace />
    </main>
  )
}
