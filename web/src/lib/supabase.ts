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

export interface SitemapSource {
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

export async function getStats(): Promise<Stats> {
  const response = await fetch('/api/stats')
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load stats')
  return (await response.json()) as Stats
}

export async function getGames(filters?: {
  minPlatforms?: number
  domain?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<Game[]> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters || {})) {
    if (value != null && value !== '') query.set(key, String(value))
  }
  const response = await fetch(`/api/games${query.size ? `?${query}` : ''}`)
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load games')
  return (await response.json()) as Game[]
}

export async function getSources(): Promise<SitemapSource[]> {
  const response = await fetch('/api/sources')
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load sources')
  return (await response.json()) as SitemapSource[]
}

export interface Discovery {
  id: number
  sourceId: number
  sourceUrl: string | null
  site: string
  canonicalUrl: string
  originalUrl: string
  rawSegment: string | null
  phrase: string | null
  excluded: boolean
  firstSeenAt: string
  lastSeenAt: string
}

export interface SignalOccurrence {
  sourceId: number
  sourceUrl: string | null
  site: string
  url: string
  canonicalUrl: string
  rawSegment: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface DemandSignal {
  phrase: string
  occurrenceCount: number
  distinctSiteCount: number
  priority: boolean
  firstSeenAt: string
  lastSeenAt: string
  sites: string[]
  occurrences: SignalOccurrence[]
}

export async function addSource(url: string): Promise<SitemapSource> {
  const response = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to add source')
  return (await response.json()) as SitemapSource
}

export async function deactivateSource(id: number) {
  const response = await fetch('/api/sources', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, active: false })
  })
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to deactivate source')
}

export async function getRecentDiscoveries(limit = 50): Promise<Discovery[]> {
  const response = await fetch(`/api/discoveries?limit=${encodeURIComponent(limit)}`)
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load discoveries')
  return (await response.json()) as Discovery[]
}

export async function getSignals(): Promise<DemandSignal[]> {
  const response = await fetch('/api/signals')
  if (!response.ok) throw new Error((await response.json()).error || 'Failed to load demand signals')
  return (await response.json()) as DemandSignal[]
}
