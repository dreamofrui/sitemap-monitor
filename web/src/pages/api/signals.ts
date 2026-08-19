import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../server/monitor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const monitor = createMonitor()
    return res.status(200).json((await monitor.getDashboardData()).signals)
  } catch (error) {
    return handleError(res, error)
  }
}
