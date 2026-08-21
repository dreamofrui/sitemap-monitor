import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../../server/monitor.ts'

interface SourcesMonitor {
  listSources(): Promise<unknown>
  addSource(url: string): Promise<unknown>
  activateSource(id: number): Promise<unknown>
  deactivateSource(id: number): Promise<unknown>
}

export function createSourcesHandler(monitorFactory: () => SourcesMonitor = createMonitor) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!(await requireAuth(req, res))) return
    try {
      const monitor = monitorFactory()
      if (req.method === 'GET') return res.status(200).json(await monitor.listSources())
      if (req.method === 'POST') {
        const source = await monitor.addSource(req.body?.url)
        return res.status(201).json(source)
      }
      if (req.method === 'PATCH') {
        const id = Number(req.body?.id)
        const source = req.body?.active ? await monitor.activateSource(id) : await monitor.deactivateSource(id)
        return res.status(200).json(source)
      }
      return res.status(405).json({ error: 'Method not allowed' })
    } catch (error) {
      return handleError(res, error)
    }
  }
}

export default createSourcesHandler()
