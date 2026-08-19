import { gunzipSync } from 'node:zlib';

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_DOCUMENTS = 1_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Canonicalizes a URL for comparison. The hostname is case-insensitive and a
 * fragment never identifies a different sitemap page. Query parameters remain
 * part of the identity because they can be meaningful to a publisher.
 */
export function canonicalizeUrl(value) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  if ((parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')) {
    parsed.port = '';
  }
  return parsed.toString();
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extractLocations(xml) {
  const locations = [];
  const locationPattern = /<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = locationPattern.exec(xml))) {
    const rawLocation = match[1].trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
    const location = decodeXml(rawLocation);
    if (location) locations.push(location);
  }
  return locations;
}

function parseSitemapDocument(xml, url) {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new Error(`Empty sitemap document: ${url}`);
  }
  const root = /<(urlset|sitemapindex)(?:\s[^>]*)?>/i.exec(xml)?.[1]?.toLowerCase();
  if (!root || !new RegExp(`<\\/${root}\\s*>`, 'i').test(xml)) {
    throw new Error(`Malformed sitemap XML: ${url}`);
  }
  const locations = extractLocations(xml);
  if (root === 'sitemapindex') return { type: 'index', locations };
  return { type: 'urlset', locations };
}

async function readResponseBody(response, url, maxBytes) {
  if (!response || response.ok === false) {
    const status = response?.status ?? 'unknown';
    throw new Error(`Sitemap fetch failed (${status}): ${url}`);
  }
  const body = response.arrayBuffer ? await response.arrayBuffer() : Buffer.from(await response.text());
  if (body.byteLength > maxBytes) throw new Error(`Sitemap exceeds size limit: ${url}`);
  let bytes = Buffer.from(body);
  const contentEncoding = response.headers?.get?.('content-encoding')?.toLowerCase();
  if (contentEncoding?.includes('gzip') || /\.gz(?:$|[?#])/i.test(url)) {
    try {
      bytes = gunzipSync(bytes);
    } catch (error) {
      throw new Error(`Invalid gzip sitemap: ${url}`, { cause: error });
    }
  }
  if (bytes.byteLength > maxBytes) throw new Error(`Sitemap exceeds size limit: ${url}`);
  return bytes.toString('utf8');
}

/**
 * Recursively resolves Sitemap Index documents and returns a deduplicated set
 * of canonical page URLs. Fetching and parsing are intentionally independent
 * of persistence so the same seam can run in Actions, Vercel, or tests.
 */
export async function fetchSitemapTree(rootUrl, {
  fetchImpl = globalThis.fetch,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxDocuments = DEFAULT_MAX_DOCUMENTS,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = 30_000,
  userAgent = 'sitemap-monitor/1.0'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const root = canonicalizeUrl(rootUrl);
  const visited = new Set();
  const pageUrls = new Set();
  const rawUrls = new Map();
  const documents = [];

  async function visit(documentUrl, depth) {
    const canonicalDocumentUrl = canonicalizeUrl(documentUrl);
    if (visited.has(canonicalDocumentUrl)) return;
    if (depth > maxDepth) throw new Error(`Sitemap nesting exceeds depth limit: ${canonicalDocumentUrl}`);
    if (visited.size >= maxDocuments) throw new Error('Sitemap document limit exceeded');
    visited.add(canonicalDocumentUrl);

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(canonicalDocumentUrl, {
        method: 'GET',
        headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1', 'user-agent': userAgent },
        ...(controller ? { signal: controller.signal } : {})
      });
      const xml = await readResponseBody(response, canonicalDocumentUrl, maxBytes);
      const parsed = parseSitemapDocument(xml, canonicalDocumentUrl);
      documents.push({ url: canonicalDocumentUrl, type: parsed.type });
      if (parsed.type === 'index') {
        for (const child of parsed.locations) {
          await visit(new URL(child, canonicalDocumentUrl).toString(), depth + 1);
        }
      } else {
        for (const page of parsed.locations) {
          try {
            const resolvedUrl = new URL(page, canonicalDocumentUrl).toString();
            const canonicalPageUrl = canonicalizeUrl(resolvedUrl);
            pageUrls.add(canonicalPageUrl);
            if (!rawUrls.has(canonicalPageUrl)) rawUrls.set(canonicalPageUrl, resolvedUrl);
          } catch {
            // Invalid loc entries are ignored, but a document with no valid
            // pages is still rejected below rather than replacing a baseline.
          }
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  await visit(root, 0);
  if (pageUrls.size === 0) throw new Error('Sitemap did not contain any page URLs');
  return { urls: [...pageUrls], rawUrls: Object.fromEntries(rawUrls), documents };
}

const DEFAULT_EXCLUSIONS = [
  /(^|\/)(sitemap|robots|feed|rss|atom)(?:[./]|$)/i,
  /(^|\/)(about|contact|privacy|terms|faq|help|login|register)(?:\/|$)/i,
  /(^|\/)(tag|tags|category|categories|genre|genres|author|users?)(?:\/|$)/i,
  /\.(?:xml|json|txt|css|js|png|jpe?g|gif|ico|svg|webp)$/i
];

/** Extracts a single, complete phrase from the final non-empty path segment. */
export function extractPhrase(value, { exclusions = DEFAULT_EXCLUSIONS } = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const rawSegment = parsed.pathname.split('/').filter(Boolean).at(-1);
  if (!rawSegment || exclusions.some((pattern) => pattern.test(parsed.pathname))) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    decoded = rawSegment;
  }
  const phrase = decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!phrase || phrase.length > 200) return null;
  return { rawSegment, phrase };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** A deterministic repository used by tests, local development, and dry runs. */
export class InMemoryMonitorRepository {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
    this.sources = new Map();
    this.sourceIds = new Map();
    this.snapshots = new Map();
    this.runs = new Map();
    this.discovered = new Map();
    this.occurrences = new Map();
    this.signals = new Map();
    this.nextSourceId = 1;
    this.nextRunId = 1;
    this.nextDiscoveryId = 1;
    this.nextOccurrenceId = 1;
  }

  now() { return this.clock().toISOString(); }

  async createSource(url) {
    const normalizedUrl = canonicalizeUrl(url);
    const existingId = this.sourceIds.get(normalizedUrl);
    if (existingId) return clone(this.sources.get(existingId));
    const now = this.now();
    const parsed = new URL(normalizedUrl);
    const source = {
      id: this.nextSourceId++, url: normalizedUrl, site: parsed.hostname,
      active: true, baselineEstablished: false, baselineAt: null,
      lastSuccessfulScanAt: null, lastScanAt: null, lastScanStatus: 'never',
      lastError: null, createdAt: now, updatedAt: now
    };
    this.sources.set(source.id, source);
    this.sourceIds.set(normalizedUrl, source.id);
    return clone(source);
  }

  async getSource(idOrUrl) {
    const id = typeof idOrUrl === 'number' ? idOrUrl : this.sourceIds.get(canonicalizeUrl(idOrUrl));
    return clone(this.sources.get(id) || null);
  }

  async listSources() {
    return [...this.sources.values()].sort((a, b) => a.id - b.id).map(clone);
  }

  async setSourceActive(id, active) {
    const source = this.sources.get(Number(id));
    if (!source) throw new Error('Sitemap source not found');
    source.active = Boolean(active);
    source.updatedAt = this.now();
    return clone(source);
  }

  async getSnapshot(sourceId) { return clone(this.snapshots.get(Number(sourceId)) || null); }

  async saveSnapshot(sourceId, snapshot) {
    const value = { sourceId: Number(sourceId), ...clone(snapshot) };
    this.snapshots.set(Number(sourceId), value);
    return clone(value);
  }

  async listSnapshots() { return [...this.snapshots.values()].map(clone); }

  async startScan(sourceId) {
    const source = this.sources.get(Number(sourceId));
    if (!source) throw new Error('Sitemap source not found');
    const now = this.now();
    const run = { id: this.nextRunId++, sourceId: Number(sourceId), status: 'running', startedAt: now, completedAt: null, error: null, newUrlCount: 0, baselineCreated: false };
    this.runs.set(run.id, run);
    source.lastScanAt = now;
    source.lastScanStatus = 'running';
    source.updatedAt = now;
    return clone(run);
  }

  async completeScan(runId, { baselineCreated = false, newUrlCount = 0 } = {}) {
    const run = this.runs.get(Number(runId));
    if (!run) throw new Error('Scan run not found');
    const now = this.now();
    Object.assign(run, { status: 'succeeded', completedAt: now, baselineCreated, newUrlCount });
    const source = this.sources.get(run.sourceId);
    source.lastSuccessfulScanAt = now;
    source.lastScanStatus = 'succeeded';
    source.lastError = null;
    if (baselineCreated) { source.baselineEstablished = true; source.baselineAt ??= now; }
    source.updatedAt = now;
    return clone(run);
  }

  async failScan(runId, error) {
    const run = this.runs.get(Number(runId));
    if (!run) throw new Error('Scan run not found');
    const message = error instanceof Error ? error.message : String(error);
    Object.assign(run, { status: 'failed', completedAt: this.now(), error: message });
    const source = this.sources.get(run.sourceId);
    source.lastScanStatus = 'failed';
    source.lastError = message;
    source.updatedAt = this.now();
    return clone(run);
  }

  async recordDiscoveredUrls(source, urls, observedAt, { rawUrls = {} } = {}) {
    const sourceId = typeof source === 'object' ? source.id : Number(source);
    const sourceData = this.sources.get(sourceId);
    const inserted = [];
    for (const url of urls) {
      const canonicalUrl = canonicalizeUrl(url);
      const key = `${sourceId}:${canonicalUrl}`;
      if (this.discovered.has(key)) continue;
      const originalUrl = rawUrls[canonicalUrl] || canonicalUrl;
      const record = { id: this.nextDiscoveryId++, sourceId, site: sourceData.site, url: canonicalUrl, originalUrl, firstSeenAt: observedAt, lastSeenAt: observedAt };
      this.discovered.set(key, record);
      inserted.push(record);
      const phraseData = extractPhrase(canonicalUrl);
      if (!phraseData) continue;
      const occurrence = { id: this.nextOccurrenceId++, discoveryId: record.id, sourceId, site: sourceData.site, url: originalUrl, canonicalUrl, rawSegment: phraseData.rawSegment, phrase: phraseData.phrase, firstSeenAt: observedAt, lastSeenAt: observedAt };
      this.occurrences.set(`${sourceId}:${canonicalUrl}`, occurrence);
      let signal = this.signals.get(phraseData.phrase);
      if (!signal) {
        signal = { phrase: phraseData.phrase, occurrenceCount: 0, distinctSiteCount: 0, priority: false, firstSeenAt: observedAt, lastSeenAt: observedAt, sites: new Set(), occurrenceIds: [], occurrences: [] };
        this.signals.set(phraseData.phrase, signal);
      }
      signal.occurrenceCount += 1;
      signal.sites.add(sourceData.site);
      signal.distinctSiteCount = signal.sites.size;
      signal.priority = signal.priority || signal.distinctSiteCount >= 2;
      signal.lastSeenAt = observedAt;
      signal.occurrenceIds.push(occurrence.id);
      signal.occurrences.push({ sourceId: occurrence.sourceId, site: occurrence.site, url: occurrence.url, canonicalUrl: occurrence.canonicalUrl, rawSegment: occurrence.rawSegment, firstSeenAt: occurrence.firstSeenAt });
    }
    return clone(inserted);
  }

  async listDiscoveredUrls(sourceId) {
    return [...this.discovered.values()].filter((entry) => entry.sourceId === Number(sourceId)).map(clone);
  }

  async listSignals() {
    return [...this.signals.values()]
      .map((signal) => ({ ...signal, sites: [...signal.sites], occurrenceIds: [...signal.occurrenceIds], occurrences: [...signal.occurrences] }))
      .sort((a, b) => Number(b.priority) - Number(a.priority) || b.distinctSiteCount - a.distinctSiteCount || b.occurrenceCount - a.occurrenceCount || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
      .map(clone);
  }

  async listRuns(sourceId) {
    return [...this.runs.values()].filter((run) => sourceId == null || run.sourceId === Number(sourceId)).map(clone);
  }
}

/**
 * Primary application use case. Persistence is supplied as an adapter, which
 * keeps scan behavior identical in GitHub Actions, Vercel, and tests.
 */
export class SitemapMonitor {
  /** @param {{repository: object, fetchImpl?: Function, fetchOptions?: object, clock?: Function}} options */
  constructor({ repository, fetchImpl = globalThis.fetch, fetchOptions = {}, clock = () => new Date() } = {}) {
    if (!repository) throw new Error('A monitor repository is required');
    this.repository = repository;
    this.fetchImpl = fetchImpl;
    this.fetchOptions = fetchOptions;
    this.clock = clock;
  }

  async addSource(url) { return this.repository.createSource(canonicalizeUrl(url)); }
  async listSources() { return this.repository.listSources(); }
  async getSource(idOrUrl) { return this.repository.getSource(idOrUrl); }
  async activateSource(id) { return this.repository.setSourceActive(id, true); }
  async deactivateSource(id) { return this.repository.setSourceActive(id, false); }

  async scanSource(idOrUrl) {
    const source = await this.repository.getSource(idOrUrl);
    if (!source) throw new Error('Sitemap source not found');
    if (!source.active) throw new Error(`Sitemap source ${source.id} is inactive`);
    const run = await this.repository.startScan(source.id);
    try {
      const current = await fetchSitemapTree(source.url, { fetchImpl: this.fetchImpl, ...this.fetchOptions });
      const previous = await this.repository.getSnapshot(source.id);
      if (previous?.urls?.length && current.urls.length < previous.urls.length * 0.5) {
        throw new Error(`Suspicious sitemap size decrease: ${current.urls.length} (previously ${previous.urls.length})`);
      }
      const previousUrls = new Set(previous?.urls || []);
      const newUrls = previous ? current.urls.filter((url) => !previousUrls.has(url)) : [];
      const observedAt = this.clock().toISOString();
      await this.repository.saveSnapshot(source.id, { urls: current.urls, documents: current.documents, observedAt });
      if (!previous) {
        await this.repository.completeScan(run.id, { baselineCreated: true, newUrlCount: 0 });
        return { source: await this.repository.getSource(source.id), run: await this.repository.listRuns(source.id).then((runs) => runs.at(-1)), baselineCreated: true, newUrls: [] };
      }
      await this.repository.recordDiscoveredUrls(source, newUrls, observedAt, { rawUrls: current.rawUrls });
      await this.repository.completeScan(run.id, { baselineCreated: false, newUrlCount: newUrls.length });
      return { source: await this.repository.getSource(source.id), run: await this.repository.listRuns(source.id).then((runs) => runs.at(-1)), baselineCreated: false, newUrls };
    } catch (error) {
      await this.repository.failScan(run.id, error);
      throw error;
    }
  }

  async scanAll() {
    const sources = await this.repository.listSources();
    const results = [];
    for (const source of sources.filter((entry) => entry.active)) {
      try { results.push(await this.scanSource(source.id)); }
      catch (error) { results.push({ source: await this.repository.getSource(source.id), error: error.message }); }
    }
    return results;
  }

  async getDashboardData() {
    return { sources: await this.repository.listSources(), signals: await this.repository.listSignals() };
  }
}
