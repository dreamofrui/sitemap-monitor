/**
 * Hosted Sitemap monitor entry point used by GitHub Actions.
 *
 * The old Cloudflare Worker/KV and game-only RSS flow is intentionally not
 * called here. This command runs the same SitemapMonitor use case as the
 * protected Dashboard's manual scan endpoint.
 */
import './load-env.js';
import { getSupabase } from './supabase.js';
import { SitemapMonitor } from '../src/services/sitemap-monitor.js';
import { SupabaseMonitorRepository } from '../src/services/supabase-monitor-repository.js';

export function createHostedMonitor({ client, fetchImpl = globalThis.fetch, fetchOptions = {} } = {}) {
  const supabase = client || getSupabase();
  return new SitemapMonitor({
    repository: new SupabaseMonitorRepository(supabase),
    fetchImpl,
    fetchOptions
  });
}

export async function runScheduledScan({ monitor = createHostedMonitor() } = {}) {
  const startedAt = Date.now();
  const results = await monitor.scanAll();
  const summary = {
    processed: results.length,
    succeeded: results.filter((result) => !result.error).length,
    failed: results.filter((result) => result.error).length,
    baselines: results.filter((result) => result.baselineCreated).length,
    newUrls: results.reduce((total, result) => total + (result.newUrls?.length || 0), 0),
    durationMs: Date.now() - startedAt,
    results
  };
  console.log(JSON.stringify({ event: 'sitemap_scan_complete', ...summary }));
  return summary;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  runScheduledScan()
    .then((summary) => {
      if (summary.failed > 0) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({ event: 'sitemap_scan_failed', error: error.message }));
      process.exitCode = 1;
    });
}
