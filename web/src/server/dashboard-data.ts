import type { SupabaseClient } from '@supabase/supabase-js'

import { createServerClient } from './monitor.ts'

export interface GameFilters {
  minPlatforms?: number
  domain?: string
  search?: string
  limit?: number
  offset?: number
}

export async function readStats(client: SupabaseClient = createServerClient()) {
  const [games, feeds, crossPlatform, highScore] = await Promise.all([
    client.from('games').select('*', { count: 'exact', head: true }),
    client.from('feeds').select('domain'),
    client.from('games').select('*', { count: 'exact', head: true }).gte('platform_count', 2),
    client.from('games').select('*', { count: 'exact', head: true }).gte('score', 2)
  ])
  for (const result of [games, feeds, crossPlatform, highScore]) {
    if (result.error) throw result.error
  }
  return {
    totalGames: games.count || 0,
    totalPlatforms: feeds.data?.length || 0,
    crossPlatformGames: crossPlatform.count || 0,
    highScoreGames: highScore.count || 0
  }
}

export async function readGames(filters: GameFilters = {}, client: SupabaseClient = createServerClient()) {
  let query = client
    .from('games')
    .select('*,game_sources(domain,url)')
    .order('score', { ascending: false })
    .order('first_seen', { ascending: false })

  if (filters.minPlatforms) query = query.gte('platform_count', filters.minPlatforms)
  if (filters.search) query = query.ilike('name', `%${filters.search}%`)
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)

  const { data, error } = await query
  if (error) throw error
  if (filters.domain && data) {
    return data.filter((game) => game.game_sources?.some((source: { domain: string }) => source.domain === filters.domain))
  }
  return data || []
}
