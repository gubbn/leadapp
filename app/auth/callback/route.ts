import { NextResponse } from 'next/server'
import { getAuthConfig, getAuthOrigin } from '@/lib/authConfig'
import { canAccessWorkspace, safeNextPath } from '@/lib/authPolicy'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = getAuthOrigin(request)
  const next = safeNextPath(url.searchParams.get('next'))
  const failure = new URL('/login', origin)
  failure.searchParams.set('next', next)
  failure.searchParams.set('error', 'sso_failed')
  const config = getAuthConfig()
  const code = url.searchParams.get('code')
  if (!config.ssoEnabled || !code || url.searchParams.has('error')) return NextResponse.redirect(failure)

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data, error: claimsError } = await supabase.auth.getClaims()
      if (!claimsError && data && canAccessWorkspace(data.claims, config.masterUserId)) {
        const response = NextResponse.redirect(new URL(next, origin))
        response.headers.set('Cache-Control', 'no-store')
        return response
      }
      await supabase.auth.signOut({ scope: 'local' })
      failure.searchParams.set('error', 'access_denied')
    }
  } catch {
    // Do not send provider errors or tokens back to the login page.
  }
  return NextResponse.redirect(failure)
}
