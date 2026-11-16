import { NextResponse } from 'next/server'
import { getAuthConfig, getAuthOrigin } from '@/lib/authConfig'
import { safeNextPath } from '@/lib/authPolicy'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = getAuthOrigin(request)
  const next = safeNextPath(url.searchParams.get('next'))
  const config = getAuthConfig()
  const failure = new URL('/login', origin)
  failure.searchParams.set('next', next)
  failure.searchParams.set('error', 'sso_unavailable')
  if (!config.ssoEnabled || !config.tenantId || !config.masterUserId) {
    return NextResponse.redirect(failure)
  }
  try {
    const callback = new URL('/auth/callback', origin)
    callback.searchParams.set('next', next)
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email',
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (!error && data.url) return NextResponse.redirect(data.url)
  } catch {
    // Keep the independent master login reachable when Microsoft sign-in fails.
  }
  return NextResponse.redirect(failure)
}
