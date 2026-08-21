import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import signinHandler from '../src/pages/api/auth/signin.ts'
import discoveriesHandler from '../src/pages/api/discoveries.ts'
import { createGamesHandler } from '../src/pages/api/games.ts'
import { createScanHandler } from '../src/pages/api/scan.ts'
import { createSignalsHandler } from '../src/pages/api/signals.ts'
import { createSourcesHandler } from '../src/pages/api/sources/index.ts'
import { createStatsHandler } from '../src/pages/api/stats.ts'

const password = 'operator-password'
const sessionSecret = 'session-signing-secret'

function createMonitor() {
  const calls: Array<[string, unknown?]> = []
  const source = {
    id: 1,
    url: 'https://alpha.example/sitemap.xml',
    site: 'alpha.example',
    active: true,
    baselineEstablished: true,
    baselineAt: '2026-08-18T08:00:00.000Z',
    lastSuccessfulScanAt: '2026-08-20T08:00:00.000Z',
    lastScanAt: '2026-08-20T08:00:00.000Z',
    lastScanStatus: 'succeeded',
    lastError: null,
    createdAt: '2026-08-17T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z'
  }
  const signal = {
    phrase: 'text to image',
    occurrenceCount: 2,
    distinctSiteCount: 2,
    priority: true,
    firstSeenAt: '2026-08-19T08:00:00.000Z',
    lastSeenAt: '2026-08-20T08:00:00.000Z',
    sites: ['alpha.example', 'beta.example'],
    occurrences: [{
      sourceId: 1,
      sourceUrl: source.url,
      site: source.site,
      url: 'https://alpha.example/tools/text-to-image',
      canonicalUrl: 'https://alpha.example/tools/text-to-image',
      rawSegment: 'text-to-image',
      firstSeenAt: '2026-08-19T08:00:00.000Z',
      lastSeenAt: '2026-08-20T08:00:00.000Z'
    }]
  }

  return {
    calls,
    async listSources() {
      calls.push(['listSources'])
      return [source]
    },
    async addSource(url: string) {
      calls.push(['addSource', url])
      return { ...source, id: 2, url, site: new URL(url).hostname }
    },
    async activateSource(id: number) {
      calls.push(['activateSource', id])
      return { ...source, id, active: true }
    },
    async deactivateSource(id: number) {
      calls.push(['deactivateSource', id])
      return { ...source, id, active: false }
    },
    async scanSource(id: number) {
      calls.push(['scanSource', id])
      return { source, baselineCreated: false, newUrls: [] }
    },
    async scanAll() {
      calls.push(['scanAll'])
      return []
    },
    async getDashboardData() {
      calls.push(['getDashboardData'])
      return { sources: [source], signals: [signal], recentDiscoveries: [] }
    }
  }
}

async function readBody(request: import('node:http').IncomingMessage) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : undefined
}

async function startApplication(
  monitor: ReturnType<typeof createMonitor>,
  dashboardReaders: {
    getStats: () => Promise<unknown>
    getGames: (filters: unknown) => Promise<unknown>
  } = {
    getStats: async () => ({ totalGames: 0, totalPlatforms: 0, crossPlatformGames: 0, highScoreGames: 0 }),
    getGames: async () => []
  }
) {
  const routes = new Map([
    ['POST /api/auth/signin', signinHandler],
    ['GET /api/sources', createSourcesHandler(() => monitor)],
    ['POST /api/sources', createSourcesHandler(() => monitor)],
    ['PATCH /api/sources', createSourcesHandler(() => monitor)],
    ['POST /api/scan', createScanHandler(() => monitor)],
    ['GET /api/signals', createSignalsHandler(() => monitor)],
    ['GET /api/discoveries', discoveriesHandler],
    ['GET /api/stats', createStatsHandler(dashboardReaders.getStats)],
    ['GET /api/games', createGamesHandler(dashboardReaders.getGames)]
  ])
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')
    const handler = routes.get(`${request.method} ${url.pathname}`)
    if (!handler) {
      response.statusCode = 404
      response.end()
      return
    }

    Object.assign(request, {
      query: Object.fromEntries(url.searchParams),
      body: await readBody(request)
    })
    Object.assign(response, {
      status(statusCode: number) {
        response.statusCode = statusCode
        return response
      },
      json(payload: unknown) {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(payload))
        return response
      }
    })
    await handler(request as never, response as never)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

async function signIn(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  })
  assert.equal(response.status, 204)
  const setCookie = response.headers.get('set-cookie')
  assert.match(setCookie || '', /sitemap_monitor_session=[^;]+/)
  assert.match(setCookie || '', /HttpOnly/i)
  assert.match(setCookie || '', /SameSite=Lax/i)
  assert.match(setCookie || '', /Secure/i)
  return setCookie!.split(';', 1)[0]
}

test.before(() => {
  Object.assign(process.env, {
    DASHBOARD_PASSWORD: password,
    DASHBOARD_SESSION_SECRET: sessionSecret,
    NODE_ENV: 'production'
  })
})

test('deployment password creates a secure session and unauthenticated reads are rejected', async () => {
  const monitor = createMonitor()
  const application = await startApplication(monitor)
  try {
    const unauthenticated = await fetch(`${application.baseUrl}/api/sources`)
    assert.equal(unauthenticated.status, 401)

    const forged = await fetch(`${application.baseUrl}/api/sources`, {
      headers: { Cookie: 'sitemap_monitor_session=forged' }
    })
    assert.equal(forged.status, 401)

    const protectedRequests = [
      fetch(`${application.baseUrl}/api/signals`),
      fetch(`${application.baseUrl}/api/discoveries`),
      fetch(`${application.baseUrl}/api/stats`),
      fetch(`${application.baseUrl}/api/games`),
      fetch(`${application.baseUrl}/api/sources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://beta.example/sitemap.xml' }) }),
      fetch(`${application.baseUrl}/api/sources`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1, active: false }) }),
      fetch(`${application.baseUrl}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1 }) })
    ]
    assert.deepEqual((await Promise.all(protectedRequests)).map((response) => response.status), [401, 401, 401, 401, 401, 401, 401])
    assert.deepEqual(monitor.calls, [])

    const cookie = await signIn(application.baseUrl)
    const authenticated = await fetch(`${application.baseUrl}/api/sources`, {
      headers: { Cookie: cookie }
    })
    assert.equal(authenticated.status, 200)
    assert.equal((await authenticated.json())[0].site, 'alpha.example')
  } finally {
    await application.close()
  }
})

test('source lifecycle mutations and manual scans stay behind the authenticated server API', async () => {
  const monitor = createMonitor()
  const application = await startApplication(monitor)
  try {
    const cookie = await signIn(application.baseUrl)
    const headers = { Cookie: cookie, 'Content-Type': 'application/json' }

    const added = await fetch(`${application.baseUrl}/api/sources`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://beta.example/sitemap.xml' })
    })
    assert.equal(added.status, 201)

    for (const active of [false, true]) {
      const updated = await fetch(`${application.baseUrl}/api/sources`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: 1, active })
      })
      assert.equal(updated.status, 200)
      assert.equal((await updated.json()).active, active)
    }

    const scanned = await fetch(`${application.baseUrl}/api/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 1 })
    })
    assert.equal(scanned.status, 200)
    assert.deepEqual(monitor.calls, [
      ['addSource', 'https://beta.example/sitemap.xml'],
      ['deactivateSource', 1],
      ['activateSource', 1],
      ['scanSource', 1]
    ])
  } finally {
    await application.close()
  }
})

test('authenticated signal reads retain evidence URLs and source hostnames', async () => {
  const monitor = createMonitor()
  const application = await startApplication(monitor)
  try {
    const cookie = await signIn(application.baseUrl)
    const response = await fetch(`${application.baseUrl}/api/signals`, {
      headers: { Cookie: cookie }
    })
    assert.equal(response.status, 200)
    const [signal] = await response.json()
    assert.equal(signal.priority, true)
    assert.equal(signal.distinctSiteCount, 2)
    assert.equal(signal.occurrences[0].site, 'alpha.example')
    assert.equal(signal.occurrences[0].url, 'https://alpha.example/tools/text-to-image')
    assert.equal(signal.occurrences[0].sourceUrl, 'https://alpha.example/sitemap.xml')
  } finally {
    await application.close()
  }
})

test('legacy dashboard reads use protected server endpoints', async () => {
  const monitor = createMonitor()
  const readers = {
    getStats: async () => ({ totalGames: 12, totalPlatforms: 3, crossPlatformGames: 4, highScoreGames: 2 }),
    getGames: async () => [{ id: 7, name: 'Portal', platform_count: 3 }]
  }
  const application = await startApplication(monitor, readers)
  try {
    const rejected = await fetch(`${application.baseUrl}/api/stats`)
    assert.equal(rejected.status, 401)

    const cookie = await signIn(application.baseUrl)
    const stats = await fetch(`${application.baseUrl}/api/stats`, { headers: { Cookie: cookie } })
    assert.equal(stats.status, 200)
    assert.equal((await stats.json()).totalGames, 12)

    const games = await fetch(`${application.baseUrl}/api/games?minPlatforms=2`, { headers: { Cookie: cookie } })
    assert.equal(games.status, 200)
    assert.equal((await games.json())[0].name, 'Portal')
  } finally {
    await application.close()
  }
})
