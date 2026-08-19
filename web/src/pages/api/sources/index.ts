import type { NextApiRequest, NextApiResponse } from 'next'
import { createMonitor, handleError, requireAuth } from '../../../server/monitor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireAuth(req, res)) return
  try {
    const monitor = createMonitor()
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
