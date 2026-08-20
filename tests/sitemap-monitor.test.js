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
