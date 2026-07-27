import AppHeader from '@/app/components/AppHeader'
import OpportunityWorkspace from '@/app/sales/[id]/OpportunityWorkspace'

export default function OpportunityPage() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <OpportunityWorkspace />
    </main>
  )
}
