export const SESSION_COOKIE_NAME = 'sitemap_monitor_session'

function configuredSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD || ''
}

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSessionToken() {
  const password = process.env.DASHBOARD_PASSWORD
  const secret = configuredSecret()
  if (!password || !secret) return ''

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(password)))
}

export async function isValidSessionToken(value?: string) {
  const expected = await createSessionToken()
  if (!value || !expected || value.length !== expected.length) return false

  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= value.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}
