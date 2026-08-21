import type { NextApiRequest, NextApiResponse } from 'next'

import { readStats } from '../../server/dashboard-data.ts'
import { handleError, requireAuth } from '../../server/monitor.ts'

export function createStatsHandler(statsReader: () => Promise<unknown> = readStats) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!(await requireAuth(req, res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    try {
      return res.status(200).json(await statsReader())
    } catch (error) {
      return handleError(res, error)
    }
  }
}

export default createStatsHandler()
