import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../server/monitor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const requestedLimit = Number(req.query.limit || 50)
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 100) : 50
    const monitor = createMonitor()
    return res.status(200).json(await monitor.listRecentDiscoveries(limit))
  } catch (error) {
    return handleError(res, error)
  }
}
