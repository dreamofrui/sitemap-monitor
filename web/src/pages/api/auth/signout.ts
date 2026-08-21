import type { NextApiRequest, NextApiResponse } from 'next'
import { clearSessionCookie } from '../../../server/monitor.ts'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  clearSessionCookie(res)
  return res.status(204).end()
}
