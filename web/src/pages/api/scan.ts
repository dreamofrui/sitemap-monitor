import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../server/monitor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const monitor = createMonitor()
    const result = req.body?.id ? await monitor.scanSource(Number(req.body.id)) : await monitor.scanAll()
    return res.status(200).json(result)
  } catch (error) {
    return handleError(res, error)
  }
}
