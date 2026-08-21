-- Production migration for the hosted Sitemap monitor.
--
-- This script is safe to run on a clean database and on a database that still
-- contains the V1 game tables. The legacy tables are retained for the existing
-- read-only game pages; the hosted tables below are the authoritative monitor
-- data model.

CREATE TABLE IF NOT EXISTS feeds (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sitemaps (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    url_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    clean_name TEXT NOT NULL UNIQUE,
    platform_count INTEGER NOT NULL DEFAULT 1,
    score REAL NOT NULL DEFAULT 1.0,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_sources (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(game_id, domain)
);

CREATE TABLE IF NOT EXISTS update_logs (
    id BIGSERIAL PRIMARY KEY,
    domain TEXT NOT NULL,
    new_games_count INTEGER NOT NULL DEFAULT 0,
    new_games JSONB,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feeds_domain ON feeds(domain);
CREATE INDEX IF NOT EXISTS idx_sitemaps_domain ON sitemaps(domain);
CREATE INDEX IF NOT EXISTS idx_games_clean_name ON games(clean_name);
CREATE INDEX IF NOT EXISTS idx_games_platform_count ON games(platform_count DESC);
CREATE INDEX IF NOT EXISTS idx_games_score ON games(score DESC);
CREATE INDEX IF NOT EXISTS idx_games_first_seen ON games(first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_game_sources_domain ON game_sources(domain);
CREATE INDEX IF NOT EXISTS idx_game_sources_url ON game_sources(url);
CREATE INDEX IF NOT EXISTS idx_update_logs_checked_at ON update_logs(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_logs_domain ON update_logs(domain);

CREATE OR REPLACE FUNCTION clean_old_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM update_logs
    WHERE checked_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS sitemap_sources (
    id BIGSERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    site TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    baseline_established BOOLEAN NOT NULL DEFAULT FALSE,
    baseline_at TIMESTAMPTZ,
    last_successful_scan_at TIMESTAMPTZ,
    last_scan_at TIMESTAMPTZ,
    last_scan_status TEXT NOT NULL DEFAULT 'never' CHECK (last_scan_status IN ('never', 'running', 'succeeded', 'failed')),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sitemap_snapshots (
    source_id BIGINT PRIMARY KEY REFERENCES sitemap_sources(id) ON DELETE CASCADE,
    urls JSONB NOT NULL,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scan_runs (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT NOT NULL REFERENCES sitemap_sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error TEXT,
    new_url_count INTEGER NOT NULL DEFAULT 0,
    baseline_created BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS discovered_urls (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT NOT NULL REFERENCES sitemap_sources(id) ON DELETE CASCADE,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    original_url TEXT,
    raw_segment TEXT,
    phrase TEXT,
    excluded BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    UNIQUE(source_id, url)
);

CREATE TABLE IF NOT EXISTS term_occurrences (
    id BIGSERIAL PRIMARY KEY,
    discovery_id BIGINT NOT NULL UNIQUE REFERENCES discovered_urls(id) ON DELETE CASCADE,
    source_id BIGINT NOT NULL REFERENCES sitemap_sources(id) ON DELETE CASCADE,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    raw_segment TEXT NOT NULL,
    phrase TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS term_signals (
    phrase TEXT PRIMARY KEY,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    distinct_site_count INTEGER NOT NULL DEFAULT 0,
    sites JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

-- Upgrade columns that may be absent in an older hosted schema.
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS original_url TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS raw_segment TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS phrase TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE term_occurrences ADD COLUMN IF NOT EXISTS canonical_url TEXT;
UPDATE term_occurrences AS occurrence
SET canonical_url = discovery.url
FROM discovered_urls AS discovery
WHERE occurrence.discovery_id = discovery.id AND occurrence.canonical_url IS NULL;
ALTER TABLE term_occurrences ALTER COLUMN canonical_url SET NOT NULL;

-- Batch writes keep large Sitemap results out of a PostgREST IN query.
CREATE OR REPLACE FUNCTION upsert_discovered_url_batch(entries JSONB)
RETURNS SETOF discovered_urls AS $$
BEGIN
    INSERT INTO discovered_urls (
        source_id, site, url, original_url, raw_segment, phrase, excluded,
        first_seen_at, last_seen_at
    )
    SELECT entry.source_id, entry.site, entry.url, entry.original_url,
           entry.raw_segment, entry.phrase, entry.excluded,
           entry.first_seen_at, entry.last_seen_at
    FROM jsonb_to_recordset(entries) AS entry(
        source_id BIGINT, site TEXT, url TEXT, original_url TEXT,
        raw_segment TEXT, phrase TEXT, excluded BOOLEAN,
        first_seen_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ
    )
    ON CONFLICT (source_id, url) DO NOTHING;

    RETURN QUERY
    SELECT discovery.*
    FROM discovered_urls AS discovery
    JOIN jsonb_to_recordset(entries) AS entry(source_id BIGINT, url TEXT)
      ON discovery.source_id = entry.source_id AND discovery.url = entry.url;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION upsert_discovered_url_batch(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_discovered_url_batch(JSONB) TO service_role;

CREATE INDEX IF NOT EXISTS idx_sitemap_sources_active ON sitemap_sources(active);
CREATE INDEX IF NOT EXISTS idx_sitemap_sources_site ON sitemap_sources(site);
CREATE INDEX IF NOT EXISTS idx_scan_runs_source ON scan_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_urls_source ON discovered_urls(source_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_term_occurrences_phrase ON term_occurrences(phrase, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_term_signals_priority ON term_signals(priority DESC, distinct_site_count DESC, occurrence_count DESC);

-- Only service-role requests can access monitoring data. The Dashboard API
-- uses the service key server-side after checking its HTTP-only session.
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitemaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE update_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitemap_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitemap_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on feeds" ON feeds;
DROP POLICY IF EXISTS "Allow service write on feeds" ON feeds;
DROP POLICY IF EXISTS "Allow public read on update_logs" ON update_logs;
DROP POLICY IF EXISTS "Allow public read on games" ON games;
DROP POLICY IF EXISTS "Allow public read on game_sources" ON game_sources;
DROP POLICY IF EXISTS "Allow service write on update_logs" ON update_logs;
DROP POLICY IF EXISTS "Allow service write on games" ON games;
DROP POLICY IF EXISTS "Allow service write on game_sources" ON game_sources;
DROP POLICY IF EXISTS "service access feeds" ON feeds;
DROP POLICY IF EXISTS "service access sitemaps" ON sitemaps;
DROP POLICY IF EXISTS "service access games" ON games;
DROP POLICY IF EXISTS "service access game sources" ON game_sources;
DROP POLICY IF EXISTS "service access update logs" ON update_logs;
DROP POLICY IF EXISTS "service access sitemap sources" ON sitemap_sources;
DROP POLICY IF EXISTS "service access sitemap snapshots" ON sitemap_snapshots;
DROP POLICY IF EXISTS "service access scan runs" ON scan_runs;
DROP POLICY IF EXISTS "service access discovered urls" ON discovered_urls;
DROP POLICY IF EXISTS "service access term occurrences" ON term_occurrences;
DROP POLICY IF EXISTS "service access term signals" ON term_signals;
CREATE POLICY "service access feeds" ON feeds FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access sitemaps" ON sitemaps FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access games" ON games FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access game sources" ON game_sources FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access update logs" ON update_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access sitemap sources" ON sitemap_sources FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access sitemap snapshots" ON sitemap_snapshots FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access scan runs" ON scan_runs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access discovered urls" ON discovered_urls FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access term occurrences" ON term_occurrences FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service access term signals" ON term_signals FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Aggregate signals are rebuilt from durable occurrences. Priority never falls
-- back to false after a phrase has been seen on two distinct sites.
CREATE OR REPLACE FUNCTION update_term_signal() RETURNS TRIGGER AS $$
DECLARE
    sites_value JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(DISTINCT site ORDER BY site), '[]'::jsonb)
      INTO sites_value FROM term_occurrences WHERE phrase = NEW.phrase;
    INSERT INTO term_signals (phrase, occurrence_count, distinct_site_count, sites, priority, first_seen_at, last_seen_at)
    SELECT NEW.phrase, COUNT(*), jsonb_array_length(sites_value), sites_value,
           jsonb_array_length(sites_value) >= 2, MIN(first_seen_at), MAX(last_seen_at)
      FROM term_occurrences WHERE phrase = NEW.phrase
    ON CONFLICT (phrase) DO UPDATE SET
      occurrence_count = EXCLUDED.occurrence_count,
      distinct_site_count = EXCLUDED.distinct_site_count,
      sites = EXCLUDED.sites,
      priority = term_signals.priority OR EXCLUDED.priority,
      first_seen_at = LEAST(term_signals.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(term_signals.last_seen_at, EXCLUDED.last_seen_at);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS term_occurrence_signal_trigger ON term_occurrences;
CREATE TRIGGER term_occurrence_signal_trigger
AFTER INSERT OR UPDATE OF last_seen_at ON term_occurrences
FOR EACH ROW EXECUTE FUNCTION update_term_signal();

SELECT 'Hosted Sitemap monitor migration completed successfully' AS status;
