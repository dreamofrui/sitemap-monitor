# Hosted Sitemap Monitor

This repository monitors configured Sitemap URLs without a self-managed server.
GitHub Actions runs the scanner every four hours, Supabase stores durable
snapshots and post-baseline URL evidence, and a password-protected Vercel
Dashboard exposes source health and cross-site phrase signals.

## Runtime

- `src/services/sitemap-monitor.js` is the shared scan use case.
- `lib/check-sitemaps.js` runs that use case from GitHub Actions.
- `src/services/supabase-monitor-repository.js` persists sources, snapshots,
  scan runs, discoveries, occurrences, and aggregated signals.
- `web/` contains the protected Next.js Dashboard and server-side API routes.
- `supabase/migration.sql` is the production database migration.
- `.github/workflows/check-sitemaps.yml` schedules scans with a manual trigger.

The legacy Cloudflare Worker and notification path are not part of the hosted
runtime. The browser never receives a Supabase key; Dashboard requests use an
HTTP-only deployment session and server-side service credentials.

## Local checks

Install dependencies and run the full test and typecheck commands from the
repository root:

```bash
npm install
npm --prefix web install
npm test
npm run typecheck
npm run build
```

The scanner can be run locally with `SUPABASE_URL` and
`SUPABASE_SERVICE_KEY` in `.dev.vars` (the file is ignored by Git).

## Production setup

1. Run `supabase/migration.sql` in the production Supabase SQL editor.
2. Add GitHub Actions secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
3. Import the repository root into Vercel and set
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DASHBOARD_PASSWORD`, and
   `DASHBOARD_SESSION_SECRET` as Production environment variables.
4. Do not configure `NEXT_PUBLIC_SUPABASE_*` variables. Service credentials are
   server-only.
5. Add a Sitemap in the Dashboard and run its first scan to establish a
   baseline. Later scans report new URLs and normalized final path phrases.

See [`DEPLOYMENT-CHECKLIST.md`](DEPLOYMENT-CHECKLIST.md) for the complete
baseline, failure-preservation, manual workflow, and deployment verification
procedure. `scripts/verify-deployment.js` checks the protected production
endpoints and can optionally run a source scan with `VERIFY_SOURCE_ID`.
