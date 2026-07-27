import AppHeader from '@/app/components/AppHeader'
import PlaybookWorkspace from '@/app/playbook/PlaybookWorkspace'

export default function PlaybookPage() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <PlaybookWorkspace />
    </main>
  )
}
