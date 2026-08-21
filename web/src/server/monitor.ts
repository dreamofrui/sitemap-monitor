import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SitemapMonitor } from '../../../src/services/sitemap-monitor.js'
import { SupabaseMonitorRepository } from '../../../src/services/supabase-monitor-repository.js'
import { createSessionToken, isValidSessionToken, SESSION_COOKIE_NAME } from './session.ts'

export async function isAuthenticated(req: NextApiRequest) {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) || []
  const value = cookies
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1)
  return isValidSessionToken(value)
}

export async function setSessionCookie(res: NextApiResponse) {
  const token = await createSessionToken()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`)
}

export function clearSessionCookie(res: NextApiResponse) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

export async function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  if (await isAuthenticated(req)) return true
  res.status(401).json({ error: 'Authentication required' })
  return false
}

export function createServerClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Server Supabase credentials are not configured')
  return createClient(url, key)
}

export function createMonitor() {
  return new SitemapMonitor({ repository: new SupabaseMonitorRepository(createServerClient()) })
}

export function handleError(res: NextApiResponse, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  res.status(500).json({ error: message })
}
