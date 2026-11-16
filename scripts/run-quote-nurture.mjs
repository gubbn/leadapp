import { setTimeout } from 'node:timers/promises'

const secret = process.env.QUOTE_NURTURE_SECRET?.trim()
const appUrl = process.env.QUOTE_NURTURE_APP_URL ?? 'http://localhost:3000'
if (!secret) {
  console.error('Set QUOTE_NURTURE_SECRET before starting the worker.')
  process.exit(1)
}

const endpoint = new URL('/api/quote-nurture/run', appUrl)
while (true) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(120_000),
    })
    const result = await response.json()
    if (!response.ok || result.failed || result.accepted) console.log('Quote nurture', response.status, result)
  } catch {
    console.error('Quote nurture could not reach the app.')
  }
  await setTimeout(5 * 60_000)
}
