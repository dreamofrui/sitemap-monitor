import crypto from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SitemapMonitor } from '../../../src/services/sitemap-monitor.js'
import { SupabaseMonitorRepository } from '../../../src/services/supabase-monitor-repository.js'

const COOKIE_NAME = 'sitemap_monitor_session'

function secret() {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD || ''
}

function sessionToken() {
  const configuredPassword = process.env.DASHBOARD_PASSWORD
  if (!configuredPassword || !secret()) return ''
  return crypto.createHmac('sha256', secret()).update(configuredPassword).digest('hex')
}

export function isAuthenticated(req: NextApiRequest) {
  const cookies = req.headers.cookie?.split(';').map((part) => part.trim()) || []
  const value = cookies.find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1)
  const expected = sessionToken()
  if (!value || !expected) return false
  const actualBytes = Buffer.from(value)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes)
}

export function setSessionCookie(res: NextApiResponse) {
  const token = sessionToken()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`)
}

export function clearSessionCookie(res: NextApiResponse) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

export function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  if (isAuthenticated(req)) return true
  res.status(401).json({ error: 'Authentication required' })
  return false
}

export function createMonitor() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Server Supabase credentials are not configured')
  const client = createClient(url, key)
  return new SitemapMonitor({ repository: new SupabaseMonitorRepository(client) })
}

export function handleError(res: NextApiResponse, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  res.status(500).json({ error: message })
}
