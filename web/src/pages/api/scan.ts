import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../server/monitor.ts'

interface ScanMonitor {
  scanSource(id: number): Promise<unknown>
  scanAll(): Promise<unknown>
}

export function createScanHandler(monitorFactory: () => ScanMonitor = createMonitor) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!(await requireAuth(req, res))) return
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    try {
      const monitor = monitorFactory()
      const result = req.body?.id ? await monitor.scanSource(Number(req.body.id)) : await monitor.scanAll()
      return res.status(200).json(result)
    } catch (error) {
      return handleError(res, error)
    }
  }
}

export default createScanHandler()
