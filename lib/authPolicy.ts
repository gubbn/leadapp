export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/'
  const path = new URL(value, 'https://growth-desk.invalid')
  if (path.pathname === '/login' || path.pathname.startsWith('/auth/')) return '/'
  return `${path.pathname}${path.search}${path.hash}`
}

type AuthClaims = {
  sub?: string
  growth_desk_access?: unknown
  amr?: unknown
}

// Call only with claims verified by Supabase, never browser-decoded JWT data.
export function canAccessWorkspace(claims: AuthClaims, masterUserId: string) {
  if (!masterUserId) return false
  const methods = Array.isArray(claims.amr)
    ? claims.amr.map((entry: { method?: string }) => entry?.method)
    : []
  if (claims.growth_desk_access === 'master') {
    return claims.sub === masterUserId && methods.includes('password') && !methods.includes('oauth')
  }
  return claims.growth_desk_access === 'm365' && claims.sub !== masterUserId && methods.includes('oauth') && !methods.includes('password')
}
