type GraphTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

export type M365ConfigStatus = {
  ready: boolean
  missing: string[]
  senderUser: string
}

const requiredEnv = [
  'M365_TENANT_ID',
  'M365_CLIENT_ID',
  'M365_CLIENT_SECRET',
  'M365_SENDER_USER',
] as const

export function getM365ConfigStatus(): M365ConfigStatus {
  const missing = requiredEnv.filter((key) => !process.env[key]?.trim())

  return {
    ready: missing.length === 0,
    missing,
    senderUser: process.env.M365_SENDER_USER?.trim() || '',
  }
}

export async function getGraphAccessToken() {
  const status = getM365ConfigStatus()

  if (!status.ready) {
    throw new Error(`Missing Microsoft 365 config: ${status.missing.join(', ')}`)
  }

  const tenantId = process.env.M365_TENANT_ID?.trim()
  const clientId = process.env.M365_CLIENT_ID?.trim()
  const clientSecret = process.env.M365_CLIENT_SECRET?.trim()

  const body = new URLSearchParams({
    client_id: clientId || '',
    client_secret: clientSecret || '',
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  })

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    },
  )

  const data = (await response.json()) as GraphTokenResponse

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Microsoft token request failed with ${response.status}`,
    )
  }

  return data.access_token
}

export async function sendM365Mail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  const token = await getGraphAccessToken()
  const senderUser = process.env.M365_SENDER_USER?.trim()

  if (!senderUser) {
    throw new Error('Missing M365_SENDER_USER')
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      senderUser,
    )}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
          internetMessageHeaders: [
            {
              name: 'x-fixingit-campaign-automation',
              value: 'marketing-dashboard',
            },
          ],
        },
        saveToSentItems: true,
      }),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      errorText || `Microsoft Graph sendMail failed with ${response.status}`,
    )
  }

  return {
    accepted: response.status === 202,
    status: response.status,
    text,
  }
}

export function addTrackingToHtml({
  html,
  trackingId,
  baseUrl,
}: {
  html: string
  trackingId: string
  baseUrl: string
}) {
  const pixel = `<img src="${baseUrl}/api/track/open/${encodeURIComponent(
    trackingId,
  )}" width="1" height="1" alt="" style="display:none" />`

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }

  return `${html}${pixel}`
}
