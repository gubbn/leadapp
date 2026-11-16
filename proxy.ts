import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAuthConfig } from '@/lib/authConfig'
import { canAccessWorkspace } from '@/lib/authPolicy'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const pathname = request.nextUrl.pathname

  const isPublicRoute =
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname === '/api/networking/extract' ||
    pathname === '/api/quote-nurture/run' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'

  if (isPublicRoute) {
    return supabaseResponse
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Sign-in is not configured.' }, { status: 503 })
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        supabaseResponse = NextResponse.next({
          request,
        })

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  let user = null

  try {
    const userResult = await withTimeout(
      supabase.auth.getUser(),
      process.env.NODE_ENV === 'development' ? 3000 : 8000,
    )

    user = userResult.data.user
    const authConfig = getAuthConfig()
    if (user && authConfig.ssoEnabled) {
      const claimsResult = await withTimeout(supabase.auth.getClaims(), 8000)
      if (claimsResult.error || !claimsResult.data || !canAccessWorkspace(claimsResult.data.claims, authConfig.masterUserId)) {
        user = null
      }
    }
  } catch {
    user = null
  }

  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)

    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: 'Sign in with an authorised account.' }, { status: 401 })
      : NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  return supabaseResponse
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Auth check timed out.')), timeoutMs)
    }),
  ])
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
