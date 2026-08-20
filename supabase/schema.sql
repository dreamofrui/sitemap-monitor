-- Sitemap Diff - Supabase Schema V2
-- 用于追踪跨平台游戏

-- 订阅源表
CREATE TABLE IF NOT EXISTS feeds (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sitemap 内容表（存储用于对比）
CREATE TABLE IF NOT EXISTS sitemaps (
    id SERIAL PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    url_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 游戏表（核心）
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    clean_name TEXT NOT NULL UNIQUE,
    platform_count INTEGER DEFAULT 1,
    score REAL DEFAULT 1.0,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 游戏来源表
CREATE TABLE IF NOT EXISTS game_sources (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, domain)
);

-- 更新记录表
CREATE TABLE IF NOT EXISTS update_logs (
    id SERIAL PRIMARY KEY,
    domain TEXT NOT NULL,
    new_games_count INTEGER DEFAULT 0,
    new_games JSONB,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
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

-- 启用 RLS
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitemaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE update_logs ENABLE ROW LEVEL SECURITY;

-- 公开读取策略
CREATE POLICY "Allow public read on feeds" ON feeds FOR SELECT USING (true);
CREATE POLICY "Allow public read on sitemaps" ON sitemaps FOR SELECT USING (true);
CREATE POLICY "Allow public read on games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow public read on game_sources" ON game_sources FOR SELECT USING (true);
CREATE POLICY "Allow public read on update_logs" ON update_logs FOR SELECT USING (true);

-- 服务端写入策略
CREATE POLICY "Allow service write on feeds" ON feeds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write on sitemaps" ON sitemaps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write on games" ON games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write on game_sources" ON game_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service write on update_logs" ON update_logs FOR ALL USING (true) WITH CHECK (true);

-- 清理旧日志的函数
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

-- Hosted monitor runtime ---------------------------------------------------
-- These tables are authoritative for Sitemap monitoring. The game tables
-- above remain for backwards-compatible reads while existing data is retired.

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
    -- url is the canonical comparison URL; original_url preserves evidence.
    url TEXT NOT NULL,
    original_url TEXT,
    raw_segment TEXT,
    phrase TEXT,
    excluded BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    UNIQUE(source_id, url)
);

ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS original_url TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS raw_segment TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS phrase TEXT;
ALTER TABLE discovered_urls ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT FALSE;

-- JSON input keeps large URL batches in the request body instead of a
-- PostgREST `IN (...)` query string. Existing rows are returned on retry.
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
        source_id BIGINT,
        site TEXT,
        url TEXT,
        original_url TEXT,
        raw_segment TEXT,
        phrase TEXT,
        excluded BOOLEAN,
        first_seen_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ
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

CREATE TABLE IF NOT EXISTS term_occurrences (
    id BIGSERIAL PRIMARY KEY,
    discovery_id BIGINT NOT NULL UNIQUE REFERENCES discovered_urls(id) ON DELETE CASCADE,
    source_id BIGINT NOT NULL REFERENCES sitemap_sources(id) ON DELETE CASCADE,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    -- Canonical comparison URL; url remains the original evidence URL.
    canonical_url TEXT NOT NULL,
    raw_segment TEXT NOT NULL,
    phrase TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE term_occurrences ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Upgrade databases created before canonical occurrence URLs and discovery
-- phrase evidence were stored explicitly.
UPDATE term_occurrences AS occurrence
SET canonical_url = discovery.url
FROM discovered_urls AS discovery
WHERE occurrence.discovery_id = discovery.id
  AND occurrence.canonical_url IS NULL;

UPDATE discovered_urls AS discovery
SET raw_segment = occurrence.raw_segment,
    phrase = occurrence.phrase
FROM term_occurrences AS occurrence
WHERE occurrence.discovery_id = discovery.id
  AND (discovery.raw_segment IS NULL OR discovery.phrase IS NULL);

ALTER TABLE term_occurrences ALTER COLUMN canonical_url SET NOT NULL;

CREATE TABLE IF NOT EXISTS term_signals (
    phrase TEXT PRIMARY KEY,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    distinct_site_count INTEGER NOT NULL DEFAULT 0,
    sites JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sitemap_sources_active ON sitemap_sources(active);
CREATE INDEX IF NOT EXISTS idx_sitemap_sources_site ON sitemap_sources(site);
CREATE INDEX IF NOT EXISTS idx_scan_runs_source ON scan_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_urls_source ON discovered_urls(source_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_term_occurrences_phrase ON term_occurrences(phrase, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_term_signals_priority ON term_signals(priority DESC, distinct_site_count DESC, occurrence_count DESC);

ALTER TABLE sitemap_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sitemap_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE term_signals ENABLE ROW LEVEL SECURITY;

-- Browser clients should only receive read models through the protected
-- server-side Dashboard API. Service-role access bypasses these policies.
CREATE POLICY "service access sitemap sources" ON sitemap_sources FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service access sitemap snapshots" ON sitemap_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service access scan runs" ON scan_runs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service access discovered urls" ON discovered_urls FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service access term occurrences" ON term_occurrences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service access term signals" ON term_signals FOR ALL USING (auth.role() = 'service_role');

-- Rebuild a signal whenever an occurrence is added. Priority is historical:
-- once two distinct sites have contributed, it never falls back to false.
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
AFTER INSERT ON term_occurrences FOR EACH ROW EXECUTE FUNCTION update_term_signal();
