import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../server/monitor.ts'

interface SignalsMonitor {
  getDashboardData(): Promise<{ signals: unknown }>
}

export function createSignalsHandler(monitorFactory: () => SignalsMonitor = createMonitor) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!(await requireAuth(req, res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    try {
      const monitor = monitorFactory()
      return res.status(200).json((await monitor.getDashboardData()).signals)
    } catch (error) {
      return handleError(res, error)
    }
  }
}

export default createSignalsHandler()
