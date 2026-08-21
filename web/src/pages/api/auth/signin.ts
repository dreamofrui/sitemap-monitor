import type { NextApiRequest, NextApiResponse } from 'next'
import { setSessionCookie } from '../../../server/monitor.ts'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const configured = process.env.DASHBOARD_PASSWORD
  if (!configured) return res.status(503).json({ error: 'Dashboard password is not configured' })
  if (req.body?.password !== configured) return res.status(401).json({ error: 'Invalid password' })
  await setSessionCookie(res)
  return res.status(204).end()
}
