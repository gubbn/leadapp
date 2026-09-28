'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

export default function LogoutButton() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleLogout() {
    setIsSigningOut(true)

    await supabase.auth.signOut()

    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isSigningOut}
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black text-stone-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      <LogOut size={15} />
      {isSigningOut ? 'Signing out...' : 'Logout'}
    </button>
  )
}
