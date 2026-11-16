import { NextResponse } from 'next/server'
import { getAuthConfig, getAuthOrigin } from '@/lib/authConfig'
import { canAccessWorkspace } from '@/lib/authPolicy'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  // Passwords are accepted only from this app's own login form.
  if (request.headers.get('origin') !== getAuthOrigin(request)) {
    return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 403 })
  }
  const config = getAuthConfig()
  if (config.ssoEnabled && !config.masterUserId) {
    return NextResponse.json({ error: 'Master account sign-in is not configured yet.' }, { status: 503 })
  }
  try {
    const body = await request.json()
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.trim() || !body.password) {
      return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 })
    }
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email.trim(), password: body.password })
    if (error || !data.user) {
      return NextResponse.json({ error: 'Sign-in failed. Check your email address and password.' }, { status: 401 })
    }
    if (config.ssoEnabled) {
      const claims = await supabase.auth.getClaims()
      if (claims.error || !claims.data || data.user.id !== config.masterUserId || !canAccessWorkspace(claims.data.claims, config.masterUserId)) {
        await supabase.auth.signOut({ scope: 'local' })
        return NextResponse.json({ error: 'Password sign-in is reserved for the master account. Please use Microsoft 365.' }, { status: 403 })
      }
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
