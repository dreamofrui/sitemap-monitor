import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Keep module evaluation safe during `next build`, where deployment secrets
// are intentionally unavailable. Private writes and monitor reads go through
// the authenticated server API; this client only supports the legacy public
// read views that remain in the dashboard.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
)

export interface Game {
  id: number
  name: string
  clean_name: string
  platform_count: number
  score: number
  first_seen: string
  updated_at: string
  game_sources?: GameSource[]
}

export interface GameSource {
  id: number
  game_id: number
  domain: string
  url: string
  first_seen: string
}

export interface Feed {
  id: number
  url: string
  domain: string
  created_at: string
  updated_at: string
  site?: string
  active?: boolean
  baselineEstablished?: boolean
  baselineAt?: string | null
  lastSuccessfulScanAt?: string | null
  lastScanAt?: string | null
  lastScanStatus?: string
  lastError?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Stats {
  totalGames: number
  totalPlatforms: number
  crossPlatformGames: number
  highScoreGames: number
}

// 获取统计数据
export async function getStats(): Promise<Stats> {
  // 总游戏数
  const { count: totalGames } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })

  // 总平台数
  const { data: platforms } = await supabase
    .from('feeds')
    .select('domain')

  // 跨平台游戏数 (platform_count >= 2)
  const { count: crossPlatformGames } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .gte('platform_count', 2)

  // 高分游戏数 (score >= 2.0)
  const { count: highScoreGames } = await supabase
    .from('games')
    .select('*', { count: 'exact', head: true })
    .gte('score', 2.0)

  return {
    totalGames: totalGames || 0,
    totalPlatforms: platforms?.length || 0,
    crossPlatformGames: crossPlatformGames || 0,
    highScoreGames: highScoreGames || 0,
  }
}

// 获取游戏列表
export async function getGames(filters?: {
  minPlatforms?: number
  domain?: string
  search?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('games')
    .select(`
      *,
      game_sources (
        domain,
        url
      )
    `)
    .order('score', { ascending: false })
    .order('first_seen', { ascending: false })

  if (filters?.minPlatforms) {
    query = query.gte('platform_count', filters.minPlatforms)
  }

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) throw error

  // 如果需要按域名筛选，在客户端过滤
  if (filters?.domain && data) {
    return data.filter(game =>
      game.game_sources?.some((source: GameSource) => source.domain === filters.domain)
    )
  }

  return data || []
}

// 获取所有 feeds
export async function getFeeds(): Promise<Feed[]> {
  const response = await fetch('/api/sources')
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load sources')
  return (await response.json()) as Feed[]
}

// 添加 feed
export async function addFeed(url: string): Promise<Feed> {
  const response = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to add source')
  return (await response.json()) as Feed
}

// 删除 feed
export async function deleteFeed(id: number) {
  const response = await fetch('/api/sources', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, active: false })
  })
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to deactivate source')
}
