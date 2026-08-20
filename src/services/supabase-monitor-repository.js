import { canonicalizeUrl, extractPhrase, extractPhraseCandidate } from './sitemap-monitor.js';

const sourceFields = 'id,url,site,active,baseline_established,baseline_at,last_successful_scan_at,last_scan_at,last_scan_status,last_error,created_at,updated_at';
const WRITE_BATCH_SIZE = 500;

function batches(values, size = WRITE_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function sourceFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    site: row.site,
    active: row.active,
    baselineEstablished: row.baseline_established,
    baselineAt: row.baseline_at,
    lastSuccessfulScanAt: row.last_successful_scan_at,
    lastScanAt: row.last_scan_at,
    lastScanStatus: row.last_scan_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function discoveryFromRow(row, sourceUrl) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceUrl: sourceUrl || null,
    site: row.site,
    canonicalUrl: row.url,
    originalUrl: row.original_url || row.url,
    rawSegment: row.raw_segment || null,
    phrase: row.phrase || null,
    excluded: Boolean(row.excluded),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

/** Supabase adapter for the same contract used by SitemapMonitor. */
export class SupabaseMonitorRepository {
  constructor(client) {
    if (!client) throw new Error('A Supabase client is required');
    this.client = client;
  }

  async createSource(url) {
    const normalized = canonicalizeUrl(url);
    const parsed = new URL(normalized);
    const { data, error } = await this.client.from('sitemap_sources')
      .upsert({ url: normalized, site: parsed.hostname }, { onConflict: 'url' })
      .select(sourceFields)
      .single();
    if (error) throw error;
    return sourceFromRow(data);
  }

  async getSource(idOrUrl) {
    let query = this.client.from('sitemap_sources').select(sourceFields);
    query = typeof idOrUrl === 'number' ? query.eq('id', idOrUrl) : query.eq('url', canonicalizeUrl(idOrUrl));
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return sourceFromRow(data);
  }

  async listSources() {
    const { data, error } = await this.client.from('sitemap_sources').select(sourceFields).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(sourceFromRow);
  }

  async setSourceActive(id, active) {
    const { data, error } = await this.client.from('sitemap_sources').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select(sourceFields).single();
    if (error) throw error;
    return sourceFromRow(data);
  }

  async getSnapshot(sourceId) {
    const { data, error } = await this.client.from('sitemap_snapshots').select('source_id,urls,documents,observed_at').eq('source_id', sourceId).maybeSingle();
    if (error) throw error;
    return data ? { sourceId: data.source_id, urls: data.urls || [], documents: data.documents || [], observedAt: data.observed_at } : null;
  }

  async saveSnapshot(sourceId, snapshot) {
    const { data, error } = await this.client.from('sitemap_snapshots').upsert({ source_id: sourceId, urls: snapshot.urls, documents: snapshot.documents || [], observed_at: snapshot.observedAt }, { onConflict: 'source_id' }).select('source_id,urls,documents,observed_at').single();
    if (error) throw error;
    return { sourceId: data.source_id, urls: data.urls || [], documents: data.documents || [], observedAt: data.observed_at };
  }

  async startScan(sourceId) {
    const { data, error } = await this.client.from('scan_runs').insert({ source_id: sourceId, status: 'running' }).select('id,source_id,status,started_at,completed_at,error,new_url_count,baseline_created').single();
    if (error) throw error;
    const sourceResult = await this.client.from('sitemap_sources').update({ last_scan_at: data.started_at, last_scan_status: 'running', updated_at: data.started_at }).eq('id', sourceId);
    if (sourceResult.error) throw sourceResult.error;
    return { id: data.id, sourceId: data.source_id, status: data.status, startedAt: data.started_at, completedAt: data.completed_at, error: data.error, newUrlCount: data.new_url_count || 0, baselineCreated: data.baseline_created || false };
  }

  async completeScan(runId, { baselineCreated = false, newUrlCount = 0 } = {}) {
    const completedAt = new Date().toISOString();
    const { data, error } = await this.client.from('scan_runs').update({ status: 'succeeded', completed_at: completedAt, baseline_created: baselineCreated, new_url_count: newUrlCount }).eq('id', runId).select('id,source_id,status,started_at,completed_at,error,new_url_count,baseline_created').single();
    if (error) throw error;
    const sourceUpdate = { last_successful_scan_at: completedAt, last_scan_status: 'succeeded', last_error: null, updated_at: completedAt };
    if (baselineCreated) Object.assign(sourceUpdate, { baseline_established: true, baseline_at: completedAt });
    const sourceResult = await this.client.from('sitemap_sources').update(sourceUpdate).eq('id', data.source_id);
    if (sourceResult.error) throw sourceResult.error;
    return { id: data.id, sourceId: data.source_id, status: data.status, startedAt: data.started_at, completedAt: data.completed_at, error: data.error, newUrlCount: data.new_url_count || 0, baselineCreated: data.baseline_created || false };
  }

  async failScan(runId, errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
    const completedAt = new Date().toISOString();
    const { data, error } = await this.client.from('scan_runs').update({ status: 'failed', completed_at: completedAt, error: message }).eq('id', runId).select('id,source_id,status,started_at,completed_at,error,new_url_count,baseline_created').single();
    if (error) throw error;
    const sourceResult = await this.client.from('sitemap_sources').update({ last_scan_status: 'failed', last_error: message, updated_at: completedAt }).eq('id', data.source_id);
    if (sourceResult.error) throw sourceResult.error;
    return { id: data.id, sourceId: data.source_id, status: data.status, startedAt: data.started_at, completedAt: data.completed_at, error: data.error, newUrlCount: data.new_url_count || 0, baselineCreated: data.baseline_created || false };
  }

  async recordDiscoveredUrls(source, urls, observedAt, { rawUrls = {}, phraseOptions = {} } = {}) {
    if (!urls.length) return [];
    const rows = urls.map((url) => {
      const canonicalUrl = canonicalizeUrl(url);
      const candidate = extractPhraseCandidate(canonicalUrl);
      const phraseData = extractPhrase(canonicalUrl, phraseOptions);
      return {
        source_id: source.id,
        site: source.site,
        url: canonicalUrl,
        original_url: rawUrls[canonicalUrl] ?? rawUrls[url] ?? url,
        raw_segment: candidate?.rawSegment ?? null,
        phrase: candidate?.phrase ?? null,
        excluded: Boolean(candidate && !phraseData),
        first_seen_at: observedAt,
        last_seen_at: observedAt
      };
    });
    const discoveries = [];
    for (const batch of batches(rows)) {
      const result = await this.client.rpc('upsert_discovered_url_batch', { entries: batch });
      if (result.error) throw result.error;
      discoveries.push(...(result.data || []));
    }
    const occurrences = [];
    for (const discovery of discoveries) {
      const phraseData = extractPhrase(discovery.url, phraseOptions);
      if (!phraseData) continue;
      occurrences.push({
        discovery_id: discovery.id,
        source_id: source.id,
        site: source.site,
        url: discovery.original_url || discovery.url,
        canonical_url: discovery.url,
        raw_segment: phraseData.rawSegment,
        phrase: phraseData.phrase,
        first_seen_at: discovery.first_seen_at || observedAt,
        last_seen_at: observedAt
      });
    }
    for (const batch of batches(occurrences)) {
      const occurrenceResult = await this.client.from('term_occurrences').upsert(batch, { onConflict: 'discovery_id' });
      if (occurrenceResult.error) throw occurrenceResult.error;
      // The database trigger maintains cumulative counts and permanent priority.
    }
    return discoveries.map((row) => discoveryFromRow(row, source.url));
  }

  async listDiscoveredUrls(sourceId) {
    return this.listDiscoveries({ sourceId });
  }

  async listRecentDiscoveredUrls(limit = 50) {
    return this.listDiscoveries({ limit });
  }

  async listDiscoveries({ sourceId, limit } = {}) {
    let query = this.client.from('discovered_urls')
      .select('id,source_id,site,url,original_url,raw_segment,phrase,excluded,first_seen_at,last_seen_at')
      .order('first_seen_at', { ascending: false });
    if (sourceId != null) query = query.eq('source_id', sourceId);
    if (limit != null) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return [];

    const sourceIds = [...new Set(rows.map((row) => row.source_id))];
    const sourceResult = await this.client.from('sitemap_sources').select('id,url').in('id', sourceIds);
    if (sourceResult.error) throw sourceResult.error;
    const sourceUrls = new Map((sourceResult.data || []).map((row) => [row.id, row.url]));

    return rows.map((row) => discoveryFromRow(row, sourceUrls.get(row.source_id)));
  }

  async listSignals() {
    const { data, error } = await this.client.from('term_signals').select('*').order('priority', { ascending: false }).order('distinct_site_count', { ascending: false }).order('occurrence_count', { ascending: false }).order('last_seen_at', { ascending: false });
    if (error) throw error;
    const signals = [];
    for (const row of data || []) {
      const occurrencesResult = await this.client.from('term_occurrences').select('source_id,site,url,canonical_url,raw_segment,first_seen_at').eq('phrase', row.phrase).order('first_seen_at', { ascending: true });
      if (occurrencesResult.error) throw occurrencesResult.error;
      signals.push({ phrase: row.phrase, occurrenceCount: row.occurrence_count, distinctSiteCount: row.distinct_site_count, priority: row.priority, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, sites: row.sites || [], occurrences: (occurrencesResult.data || []).map((occurrence) => ({ sourceId: occurrence.source_id, site: occurrence.site, url: occurrence.url, canonicalUrl: occurrence.canonical_url || canonicalizeUrl(occurrence.url), rawSegment: occurrence.raw_segment, firstSeenAt: occurrence.first_seen_at })) });
    }
    return signals;
  }

  async listRuns(sourceId) {
    let query = this.client.from('scan_runs').select('id,source_id,status,started_at,completed_at,error,new_url_count,baseline_created').order('started_at', { ascending: true });
    if (sourceId != null) query = query.eq('source_id', sourceId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => ({ id: row.id, sourceId: row.source_id, status: row.status, startedAt: row.started_at, completedAt: row.completed_at, error: row.error, newUrlCount: row.new_url_count || 0, baselineCreated: row.baseline_created || false }));
  }
}
