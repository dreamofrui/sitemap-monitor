import type { NextApiRequest, NextApiResponse } from 'next'

import { readGames } from '../../server/dashboard-data.ts'
import type { GameFilters } from '../../server/dashboard-data.ts'
import { handleError, requireAuth } from '../../server/monitor.ts'

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function createGamesHandler(gamesReader: (filters: GameFilters) => Promise<unknown> = readGames) {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!(await requireAuth(req, res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    try {
      const minPlatforms = Number(queryValue(req.query.minPlatforms))
      const limit = Number(queryValue(req.query.limit))
      const offset = Number(queryValue(req.query.offset))
      return res.status(200).json(await gamesReader({
        minPlatforms: Number.isFinite(minPlatforms) && minPlatforms > 0 ? minPlatforms : undefined,
        domain: queryValue(req.query.domain),
        search: queryValue(req.query.search),
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        offset: Number.isFinite(offset) && offset > 0 ? offset : undefined
      }))
    } catch (error) {
      return handleError(res, error)
    }
  }
}

export default createGamesHandler()
