import 'server-only'

export function getAuthConfig() {
  const ssoEnabled = process.env.AUTH_MODE?.trim() === 'm365'
  const masterUserId = process.env.AUTH_MASTER_USER_ID?.trim() ?? ''
  const tenantId = process.env.M365_SSO_TENANT_ID?.trim() ?? ''
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return {
    ssoEnabled,
    masterUserId: uuid.test(masterUserId) ? masterUserId.toLowerCase() : '',
    tenantId: uuid.test(tenantId) ? tenantId.toLowerCase() : '',
  }
}

export function getAuthOrigin(request: Request) {
  // Next's Docker request URL may use 0.0.0.0 instead of the browser's host.
  const host = request.headers.get('host') ?? ''
  if (process.env.NODE_ENV === 'development' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return `${new URL(request.url).protocol}//${host}`
  }
  const configured = process.env.AUTH_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) {
    const url = new URL(configured)
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:')) {
      throw new Error('The authentication app URL must use HTTPS.')
    }
    return url.origin
  }
  if (getAuthConfig().ssoEnabled) throw new Error('Configure AUTH_APP_URL before enabling Microsoft sign-in.')
  return new URL(request.url).origin
}
