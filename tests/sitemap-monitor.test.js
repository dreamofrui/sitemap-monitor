import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryMonitorRepository,
  SitemapMonitor,
  canonicalizeUrl,
  extractPhrase,
  fetchSitemapTree
} from '../src/services/sitemap-monitor.js';
import { gzipSync } from 'node:zlib';
import { SupabaseMonitorRepository } from '../src/services/supabase-monitor-repository.js';

function sitemap(urls) {
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join('')}</urlset>`;
}

function fetchFrom(responses) {
  return async (url) => {
    const response = responses[url];
    if (response instanceof Error) throw response;
    if (!response) return new Response('not found', { status: 404 });
    if (response instanceof Response) return response;
    return new Response(response, { status: 200, headers: { 'content-type': 'application/xml' } });
  };
}

function recordingSupabaseClient() {
  const discoveries = new Map();
  const calls = { rpcs: [], upserts: [] };
  let nextId = 1;

  return {
    calls,
    rpc(name, { entries }) {
      calls.rpcs.push({ name, size: entries.length, entries });
      for (const row of entries) {
        const key = `${row.source_id}:${row.url}`;
        if (!discoveries.has(key)) discoveries.set(key, { id: nextId++, ...row });
      }
      return Promise.resolve({
        data: entries.map((row) => discoveries.get(`${row.source_id}:${row.url}`)),
        error: null
      });
    },
    from(table) {
      return {
        upsert(rows) {
          const values = Array.isArray(rows) ? rows : [rows];
          calls.upserts.push({ table, size: values.length, rows: values });
          return Promise.resolve({ data: null, error: null });
        }
      };
    }
  };
}

function signalReadingSupabaseClient() {
  const updates = [];
  const tables = {
    term_signals: [{
      phrase: 'text to image', occurrence_count: 2, distinct_site_count: 2,
      priority: true, first_seen_at: '2026-08-20T01:00:00.000Z', last_seen_at: '2026-08-22T09:00:00.000Z',
      sites: ['a.example', 'b.example']
    }],
    term_occurrences: [{
      id: 12, discovery_id: 9, source_id: 7, site: 'a.example',
      url: 'https://a.example/text-to-image', canonical_url: 'https://a.example/text-to-image',
      raw_segment: 'text-to-image', first_seen_at: '2026-08-20T01:00:00.000Z', last_seen_at: '2026-08-22T09:00:00.000Z'
    }, {
      id: 13, discovery_id: 10, source_id: 8, site: 'b.example',
      url: 'https://b.example/text_to_image', canonical_url: null,
      raw_segment: 'text_to_image', first_seen_at: '2026-08-21T02:00:00.000Z', last_seen_at: null
    }],
    sitemap_sources: [{ id: 7, url: 'https://a.example/sitemap.xml' }, { id: 8, url: 'https://b.example/sitemap.xml' }]
  };

  function query(table) {
    const result = { data: tables[table], error: null };
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: () => builder,
      lt: () => builder,
      in: () => builder,
      update: (values) => {
        updates.push({ table, values });
        return builder;
      },
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return builder;
  }

  return { from: query, updates };
}

test('canonicalizes hostnames and preserves query strings while removing fragments', () => {
  assert.equal(canonicalizeUrl('HTTPS://Example.COM/a/?q=1#section'), 'https://example.com/a?q=1');
  assert.equal(canonicalizeUrl('https://example.com/a/#section'), 'https://example.com/a');
});

test('extracts one complete phrase from the last path segment', () => {
  assert.deepEqual(extractPhrase('https://example.com/zh/tools/text-to-image?x=1'), {
    rawSegment: 'text-to-image',
    phrase: 'text to image'
  });
});

test('decodes and normalizes case, separators, and whitespace as one phrase', () => {
  assert.deepEqual(extractPhrase('https://example.com/tools/%20Text--TO__Image%20'), {
    rawSegment: '%20Text--TO__Image%20',
    phrase: 'text to image'
  });
});

test('excludes navigation, metadata, and pagination candidates by default', () => {
  assert.equal(extractPhrase('https://example.com/category/action-games'), null);
  assert.equal(extractPhrase('https://example.com/sitemap.xml'), null);
  assert.equal(extractPhrase('https://example.com/page/2'), null);
  assert.equal(extractPhrase('https://example.com/page-3'), null);
});

test('supports configurable exclusions without discarding the discovered URL', async () => {
  const sourceUrl = 'https://example.com/sitemap.xml';
  const responses = { [sourceUrl]: sitemap(['https://example.com/old']) };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({
    repository,
    fetchImpl: fetchFrom(responses),
    phraseOptions: { exclusions: [/\/text_to_image$/i] }
  });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl] = sitemap(['https://example.com/old', 'https://example.com/text_to_image']);
  await monitor.scanSource(source.id);

  const discoveries = await repository.listRecentDiscoveredUrls();
  assert.equal(discoveries.length, 1);
  assert.equal(discoveries[0].sourceUrl, sourceUrl);
  assert.equal(discoveries[0].site, 'example.com');
  assert.equal(discoveries[0].canonicalUrl, 'https://example.com/text_to_image');
  assert.equal(discoveries[0].originalUrl, 'https://example.com/text_to_image');
  assert.equal(discoveries[0].rawSegment, 'text_to_image');
  assert.equal(discoveries[0].phrase, 'text to image');
  assert.equal(discoveries[0].excluded, true);
  assert.ok(discoveries[0].firstSeenAt);
  assert.deepEqual(await repository.listSignals(), []);
});

test('Supabase persistence batches large discovery sets and retains phrase evidence', async () => {
  const client = recordingSupabaseClient();
  const repository = new SupabaseMonitorRepository(client);
  const source = { id: 7, site: 'example.com', url: 'https://example.com/sitemap.xml' };
  const urls = Array.from({ length: 501 }, (_, index) => `https://example.com/text-to-image-${index}`);

  const discoveries = await repository.recordDiscoveredUrls(source, urls, '2026-08-20T00:00:00.000Z');

  assert.equal(discoveries.length, 501);
  assert.deepEqual(
    client.calls.rpcs.map((call) => call.size),
    [500, 1]
  );
  assert.deepEqual(
    client.calls.upserts.filter((call) => call.table === 'term_occurrences').map((call) => call.size),
    [500, 1]
  );
  assert.ok(client.calls.rpcs.every((call) => call.size <= 500));
  assert.deepEqual(client.calls.rpcs[0].entries[0], {
    source_id: 7,
    site: 'example.com',
    url: 'https://example.com/text-to-image-0',
    original_url: 'https://example.com/text-to-image-0',
    raw_segment: 'text-to-image-0',
    phrase: 'text to image 0',
    excluded: false,
    first_seen_at: '2026-08-20T00:00:00.000Z',
    last_seen_at: '2026-08-20T00:00:00.000Z'
  });
});

test('Supabase signal read model includes source evidence and URL recency', async () => {
  const client = signalReadingSupabaseClient();
  const repository = new SupabaseMonitorRepository(client);
  const signals = await repository.listSignals();

  assert.equal(signals.length, 1);
  assert.equal(signals[0].priority, true);
  assert.deepEqual(signals[0].sites, ['a.example', 'b.example']);
  assert.deepEqual(signals[0].occurrences.map((occurrence) => occurrence.sourceUrl), [
    'https://a.example/sitemap.xml',
    'https://b.example/sitemap.xml'
  ]);
  assert.equal(signals[0].occurrences[0].lastSeenAt, '2026-08-22T09:00:00.000Z');
  assert.equal(signals[0].occurrences[1].lastSeenAt, signals[0].occurrences[1].firstSeenAt);

  await repository.touchDiscoveredUrls({ id: 7 }, ['https://a.example/text-to-image'], '2026-08-22T09:00:00.000Z');
  assert.deepEqual(client.updates, [
    { table: 'discovered_urls', values: { last_seen_at: '2026-08-22T09:00:00.000Z' } },
    { table: 'term_occurrences', values: { last_seen_at: '2026-08-22T09:00:00.000Z' } }
  ]);
});

test('returns recent discoveries with source evidence and normalized phrases', async () => {
  const sourceUrl = 'https://Example.com/sitemap.xml';
  const responses = { [sourceUrl.toLowerCase()]: sitemap(['https://example.com/old']) };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl.toLowerCase()] = sitemap([
    'https://example.com/old',
    'https://Example.com/tools/text-to-image#evidence'
  ]);
  await monitor.scanSource(source.id);

  const dashboard = await monitor.getDashboardData();
  assert.equal(dashboard.recentDiscoveries.length, 1);
  assert.deepEqual(dashboard.recentDiscoveries[0], {
    id: 1,
    sourceId: source.id,
    sourceUrl: 'https://example.com/sitemap.xml',
    site: 'example.com',
    canonicalUrl: 'https://example.com/tools/text-to-image',
    originalUrl: 'https://example.com/tools/text-to-image#evidence',
    rawSegment: 'text-to-image',
    phrase: 'text to image',
    excluded: false,
    firstSeenAt: dashboard.recentDiscoveries[0].firstSeenAt,
    lastSeenAt: dashboard.recentDiscoveries[0].lastSeenAt
  });
});

test('recursively resolves indexes, deduplicates children, and supports gzip documents', async () => {
  const root = 'https://example.com/sitemap.xml';
  const child = 'https://example.com/child.xml.gz';
  const nested = 'https://example.com/nested.xml';
  const responses = {
    [root]: new Response(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${child}</loc></sitemap><sitemap><loc>${child}</loc></sitemap></sitemapindex>`),
    [child]: new Response(gzipSync(Buffer.from(`<?xml version="1.0"?><sitemapindex><sitemap><loc>${nested}</loc></sitemap></sitemapindex>`)), { headers: { 'content-type': 'application/gzip' } }),
    [nested]: new Response(sitemap(['https://Example.com/page#fragment', 'https://example.com/page', 'https://example.com/other?ref=1']))
  };
  const result = await fetchSitemapTree(root, { fetchImpl: fetchFrom(responses) });
  assert.deepEqual(result.urls, ['https://example.com/page', 'https://example.com/other?ref=1']);
  assert.equal(result.documents.length, 3);
});

test('supports gzip payloads advertised by the response headers', async () => {
  const root = 'https://example.com/sitemap.xml';
  const compressed = gzipSync(Buffer.from(sitemap(['https://example.com/header-gzip'])));
  const result = await fetchSitemapTree(root, {
    fetchImpl: fetchFrom({
      [root]: new Response(compressed, { headers: { 'content-encoding': 'gzip' } })
    })
  });
  assert.deepEqual(result.urls, ['https://example.com/header-gzip']);
});

test('accepts gzip responses already transparently decoded by fetch', async () => {
  const root = 'https://example.com/sitemap.xml';
  const body = sitemap(['https://example.com/decoded-gzip']);
  const compressedLength = gzipSync(Buffer.from(body)).byteLength;
  const result = await fetchSitemapTree(root, {
    fetchImpl: fetchFrom({
      [root]: new Response(body, {
        headers: {
          'content-encoding': 'gzip',
          'content-length': String(compressedLength)
        }
      })
    })
  });
  assert.deepEqual(result.urls, ['https://example.com/decoded-gzip']);
});

test('rejects a response whose declared body length is truncated', async () => {
  const root = 'https://example.com/sitemap.xml';
  const body = sitemap(['https://example.com/length-check']);
  await assert.rejects(
    () => fetchSitemapTree(root, {
      fetchImpl: fetchFrom({
        [root]: new Response(body, {
          headers: { 'content-type': 'application/xml', 'content-length': String(body.length + 20) }
        })
      })
    }),
    /truncated response/
  );
});

test('rejects malformed XML and empty sitemap results', async () => {
  const malformed = 'https://example.com/malformed.xml';
  const empty = 'https://example.com/empty.xml';
  await assert.rejects(
    () => fetchSitemapTree(malformed, {
      fetchImpl: fetchFrom({ [malformed]: '<urlset><url><loc>https://example.com/page</loc></urlset>' })
    }),
    /Malformed sitemap XML/
  );
  await assert.rejects(
    () => fetchSitemapTree(empty, {
      fetchImpl: fetchFrom({ [empty]: '<?xml version="1.0"?><urlset></urlset>' })
    }),
    /did not contain any page URLs/
  );
});

test('reports HTTP, byte, and nesting safety failures', async () => {
  const httpError = 'https://example.com/http-error.xml';
  await assert.rejects(
    () => fetchSitemapTree(httpError, { fetchImpl: fetchFrom({ [httpError]: new Response('unavailable', { status: 503 }) }) }),
    /fetch failed \(503\)/
  );

  const oversized = 'https://example.com/oversized.xml';
  await assert.rejects(
    () => fetchSitemapTree(oversized, { maxBytes: 10, fetchImpl: fetchFrom({ [oversized]: sitemap(['https://example.com/page']) }) }),
    /exceeds size limit/
  );

  const root = 'https://example.com/depth-root.xml';
  const child = 'https://example.com/depth-child.xml';
  await assert.rejects(
    () => fetchSitemapTree(root, {
      maxDepth: 0,
      fetchImpl: fetchFrom({
        [root]: '<?xml version="1.0"?><sitemapindex><sitemap><loc>depth-child.xml</loc></sitemap></sitemapindex>',
        [child]: sitemap(['https://example.com/page'])
      })
    }),
    /nesting exceeds depth limit/
  );

  await assert.rejects(
    () => fetchSitemapTree(root, {
      maxDocuments: 1,
      fetchImpl: fetchFrom({
        [root]: '<?xml version="1.0"?><sitemapindex><sitemap><loc>depth-child.xml</loc></sitemap></sitemapindex>',
        [child]: sitemap(['https://example.com/page'])
      })
    }),
    /document limit exceeded/
  );
});

test('reports recursive sitemap cycles instead of silently accepting a partial tree', async () => {
  const root = 'https://example.com/root.xml';
  const child = 'https://example.com/child.xml';
  await assert.rejects(
    () => fetchSitemapTree(root, {
      fetchImpl: fetchFrom({
        [root]: '<?xml version="1.0"?><sitemapindex><sitemap><loc>child.xml</loc></sitemap></sitemapindex>',
        [child]: `<?xml version="1.0"?><sitemapindex><sitemap><loc>${root}</loc></sitemap></sitemapindex>`
      })
    }),
    /cycle detected/
  );
});

test('bounds the number of unique page URLs collected from a sitemap tree', async () => {
  const root = 'https://example.com/sitemap.xml';
  await assert.rejects(
    () => fetchSitemapTree(root, {
      maxUrls: 1,
      fetchImpl: fetchFrom({ [root]: sitemap(['https://example.com/one', 'https://example.com/two']) })
    }),
    /URL limit exceeded/
  );
});

test('enforces fetch timeouts even when a fetch implementation ignores AbortSignal', async () => {
  const root = 'https://example.com/sitemap.xml';
  await assert.rejects(
    () => fetchSitemapTree(root, { timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) }),
    /timed out/
  );
});

test('keeps two sources on one hostname isolated and creates independent baselines', async () => {
  const first = 'https://example.com/sitemap-a.xml';
  const second = 'https://example.com/sitemap-b.xml';
  const responses = {
    [first]: sitemap(['https://example.com/a']),
    [second]: sitemap(['https://example.com/b'])
  };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });

  const sourceA = await monitor.addSource(first);
  const sourceB = await monitor.addSource(second);
  const baselineA = await monitor.scanSource(sourceA.id);
  const baselineB = await monitor.scanSource(sourceB.id);

  assert.equal(baselineA.baselineCreated, true);
  assert.equal(baselineA.newUrls.length, 0);
  assert.equal(baselineB.baselineCreated, true);
  assert.equal((await repository.listSnapshots()).length, 2);
  assert.notEqual(sourceA.id, sourceB.id);
});

test('reports only later additions and preserves the accepted snapshot after failure', async () => {
  const sourceUrl = 'https://example.com/sitemap.xml';
  const responses = { [sourceUrl]: sitemap(['https://example.com/one']) };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl] = sitemap(['https://example.com/one', 'https://example.com/two']);
  const second = await monitor.scanSource(source.id);
  assert.deepEqual(second.newUrls, ['https://example.com/two']);
  assert.equal((await repository.listDiscoveredUrls(source.id))[0].originalUrl, 'https://example.com/two');

  responses[sourceUrl] = new Error('temporary outage');
  await assert.rejects(() => monitor.scanSource(source.id), /temporary outage/);
  const snapshot = await repository.getSnapshot(source.id);
  assert.deepEqual(snapshot.urls, ['https://example.com/one', 'https://example.com/two']);
  const current = await monitor.getSource(source.id);
  assert.equal(current.lastError, 'temporary outage');
  assert.ok(current.lastSuccessfulScanAt);
});

test('rejects suspiciously truncated snapshots and preserves the accepted snapshot', async () => {
  const sourceUrl = 'https://example.com/sitemap.xml';
  const responses = {
    [sourceUrl]: sitemap(['https://example.com/one', 'https://example.com/two', 'https://example.com/three', 'https://example.com/four'])
  };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl] = sitemap(['https://example.com/one', 'https://example.com/two']);
  await assert.rejects(() => monitor.scanSource(source.id), /Suspicious sitemap size decrease/);
  assert.deepEqual((await repository.getSnapshot(source.id)).urls, [
    'https://example.com/one',
    'https://example.com/two',
    'https://example.com/three',
    'https://example.com/four'
  ]);
});

test('does not advance a snapshot when discovery persistence fails', async () => {
  class FailingDiscoveryRepository extends InMemoryMonitorRepository {
    failDiscovery = false;

    async recordDiscoveredUrls(...args) {
      if (this.failDiscovery) throw new Error('discovery write failed');
      return super.recordDiscoveredUrls(...args);
    }
  }

  const sourceUrl = 'https://example.com/sitemap.xml';
  const responses = { [sourceUrl]: sitemap(['https://example.com/one']) };
  const repository = new FailingDiscoveryRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl] = sitemap(['https://example.com/one', 'https://example.com/two']);
  repository.failDiscovery = true;
  await assert.rejects(() => monitor.scanSource(source.id), /discovery write failed/);
  assert.deepEqual((await repository.getSnapshot(source.id)).urls, ['https://example.com/one']);

  repository.failDiscovery = false;
  const retry = await monitor.scanSource(source.id);
  assert.deepEqual(retry.newUrls, ['https://example.com/two']);
});

test('restores the last accepted snapshot when scan completion fails', async () => {
  class FailingCompletionRepository extends InMemoryMonitorRepository {
    failCompletion = false;

    async completeScan(...args) {
      if (this.failCompletion) throw new Error('scan completion write failed');
      return super.completeScan(...args);
    }
  }

  const sourceUrl = 'https://example.com/sitemap.xml';
  const responses = { [sourceUrl]: sitemap(['https://example.com/one']) };
  const repository = new FailingCompletionRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const source = await monitor.addSource(sourceUrl);

  await monitor.scanSource(source.id);
  responses[sourceUrl] = sitemap(['https://example.com/one', 'https://example.com/two']);
  repository.failCompletion = true;
  await assert.rejects(() => monitor.scanSource(source.id), /scan completion write failed/);
  assert.deepEqual((await repository.getSnapshot(source.id)).urls, ['https://example.com/one']);
  assert.equal((await monitor.getSource(source.id)).lastError, 'scan completion write failed');

  repository.failCompletion = false;
  const retry = await monitor.scanSource(source.id);
  assert.deepEqual(retry.newUrls, ['https://example.com/two']);
});

test('deactivation pauses scans and reactivation retains history', async () => {
  const sourceUrl = 'https://example.com/sitemap.xml';
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({
    repository,
    fetchImpl: fetchFrom({ [sourceUrl]: sitemap(['https://example.com/one']) })
  });
  const source = await monitor.addSource(sourceUrl);
  await monitor.deactivateSource(source.id);
  await assert.rejects(() => monitor.scanSource(source.id), /inactive/);
  await monitor.activateSource(source.id);
  const result = await monitor.scanSource(source.id);
  assert.equal(result.baselineCreated, true);
  assert.equal((await monitor.listSources())[0].active, true);
});

test('promotes a phrase after staggered discoveries on distinct hostnames', async () => {
  const a = 'https://a.example/sitemap.xml';
  const b = 'https://b.example/sitemap.xml';
  const responses = {
    [a]: sitemap(['https://a.example/old']),
    [b]: sitemap(['https://b.example/old'])
  };
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses) });
  const sourceA = await monitor.addSource(a);
  const sourceB = await monitor.addSource(b);
  await monitor.scanSource(sourceA.id);
  await monitor.scanSource(sourceB.id);
  responses[a] = sitemap(['https://a.example/old', 'https://a.example/text-to-image']);
  await monitor.scanSource(sourceA.id);
  responses[b] = sitemap(['https://b.example/old', 'https://b.example/text_to_image']);
  await monitor.scanSource(sourceB.id);

  const signals = await repository.listSignals();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].phrase, 'text to image');
  assert.equal(signals[0].distinctSiteCount, 2);
  assert.equal(signals[0].priority, true);
});

test('aggregates cross-site signals without counting baselines or repeated URLs twice', async () => {
  const sourceUrls = {
    parentA: 'https://example.com/sitemap-a.xml',
    parentB: 'https://example.com/sitemap-b.xml',
    child: 'https://shop.example.com/sitemap.xml',
    other: 'https://other.example.com/sitemap.xml'
  };
  const responses = Object.fromEntries(Object.values(sourceUrls).map((url) => [url, sitemap(['https://example.com/existing-page'])]));

  let now = new Date('2026-08-20T00:00:00.000Z');
  const repository = new InMemoryMonitorRepository({ clock: () => now });
  const monitor = new SitemapMonitor({ repository, fetchImpl: fetchFrom(responses), clock: () => now });
  const sources = {};
  for (const [name, url] of Object.entries(sourceUrls)) sources[name] = await monitor.addSource(url);

  for (const source of Object.values(sources)) await monitor.scanSource(source.id);
  assert.deepEqual(await repository.listSignals(), []);

  now = new Date('2026-08-20T01:00:00.000Z');
  responses[sourceUrls.parentA] = sitemap(['https://example.com/text-to-image', 'https://example.com/first-signal']);
  await monitor.scanSource(sources.parentA.id);

  now = new Date('2026-08-20T08:00:00.000Z');
  responses[sourceUrls.parentB] = sitemap(['https://example.com/text-to-image', 'https://example.com/text_to_image?source=second']);
  await monitor.scanSource(sources.parentB.id);

  let signals = await repository.listSignals();
  const ordinary = signals.find((signal) => signal.phrase === 'text to image');
  assert.equal(ordinary.occurrenceCount, 3);
  assert.equal(ordinary.distinctSiteCount, 1);
  assert.equal(ordinary.priority, false);
  assert.deepEqual(ordinary.sites, ['example.com']);
  assert.equal(ordinary.occurrences[0].sourceUrl, sourceUrls.parentA);

  now = new Date('2026-08-21T12:00:00.000Z');
  responses[sourceUrls.child] = sitemap(['https://shop.example.com/text-to-image']);
  await monitor.scanSource(sources.child.id);

  signals = await repository.listSignals();
  const promoted = signals.find((signal) => signal.phrase === 'text to image');
  assert.equal(promoted.occurrenceCount, 4);
  assert.equal(promoted.distinctSiteCount, 2);
  assert.equal(promoted.priority, true);
  assert.deepEqual(promoted.sites, ['example.com', 'shop.example.com']);
  assert.equal(promoted.firstSeenAt, '2026-08-20T01:00:00.000Z');
  assert.equal(promoted.lastSeenAt, '2026-08-21T12:00:00.000Z');

  // A later scan touches evidence recency without creating a duplicate occurrence.
  now = new Date('2026-08-22T09:00:00.000Z');
  await monitor.scanSource(sources.child.id);
  const refreshed = (await repository.listSignals()).find((signal) => signal.phrase === 'text to image');
  assert.equal(refreshed.occurrenceCount, 4);
  assert.equal(refreshed.lastSeenAt, '2026-08-22T09:00:00.000Z');
  assert.equal((await repository.listDiscoveredUrls(sources.child.id))[0].lastSeenAt, '2026-08-22T09:00:00.000Z');
  assert.equal(refreshed.occurrences.find((occurrence) => occurrence.sourceId === sources.child.id).lastSeenAt, '2026-08-22T09:00:00.000Z');
});

test('ranks signals by priority, distinct sites, occurrence volume, then recency', async () => {
  const repository = new InMemoryMonitorRepository();
  const monitor = new SitemapMonitor({ repository });
  const sourceA = await monitor.addSource('https://a.example/sitemap.xml');
  const sourceB = await monitor.addSource('https://b.example/sitemap.xml');
  const sourceC = await monitor.addSource('https://c.example/sitemap.xml');
  const sourceD = await monitor.addSource('https://d.example/sitemap.xml');

  await repository.recordDiscoveredUrls(sourceA, ['https://a.example/ordinary'], '2026-08-20T01:00:00.000Z');
  await repository.recordDiscoveredUrls(sourceA, ['https://a.example/high-volume?variant=1', 'https://a.example/high-volume?variant=2'], '2026-08-20T02:00:00.000Z');
  await repository.recordDiscoveredUrls(sourceB, ['https://b.example/high-volume'], '2026-08-20T03:00:00.000Z');
  await repository.recordDiscoveredUrls(sourceC, ['https://c.example/ordinary'], '2026-08-20T04:00:00.000Z');
  await repository.recordDiscoveredUrls(sourceC, ['https://c.example/high-volume'], '2026-08-20T04:30:00.000Z');
  await repository.recordDiscoveredUrls(sourceD, ['https://d.example/other-signal'], '2026-08-20T05:00:00.000Z');

  const signals = await repository.listSignals();
  assert.deepEqual(signals.map((signal) => signal.phrase), ['high volume', 'ordinary', 'other signal']);
  assert.equal(signals[0].priority, true);
  assert.equal(signals[0].distinctSiteCount, 3);
});
