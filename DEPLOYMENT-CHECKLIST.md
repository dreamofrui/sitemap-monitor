# Hosted Monitor Deployment Checklist

Use this checklist for the first deployment and for a later recovery. The
repository root remains the Vercel project root because the Next.js API imports
the shared scanner from `src/`.

## Supabase

- [ ] Create or select the production Supabase project.
- [ ] Run `supabase/migration.sql` in the SQL editor.
- [ ] Confirm these monitor tables exist: `sitemap_sources`, `sitemap_snapshots`,
      `scan_runs`, `discovered_urls`, `term_occurrences`, and `term_signals`.
- [ ] Confirm RLS is enabled and policies allow only `service_role` access.
- [ ] Keep the project URL and service-role key available only for server-side
      deployments.

## GitHub Actions

- [ ] Add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- [ ] Confirm `.github/workflows/check-sitemaps.yml` is enabled.
- [ ] Confirm the workflow schedule is `0 */4 * * *` (every four hours UTC).
- [ ] Use **Run workflow** once to verify the manual path and inspect the JSON
      scan summary in the job log.

## Vercel

- [ ] Import the repository without changing the project root.
- [ ] Let `vercel.json` run the root build; it installs the `web` dependencies
      and builds the Next.js dashboard.
- [ ] Set these server-side environment variables for Production:
      `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DASHBOARD_PASSWORD`, and
      `DASHBOARD_SESSION_SECRET`.
- [ ] Do not configure `NEXT_PUBLIC_SUPABASE_*` variables. The browser talks to
      protected Next.js API routes and never receives a Supabase key.
- [ ] Deploy and confirm `/login` is reachable.

## First real scan

- [ ] Sign in with the deployment password and open **Sitemaps**.
- [ ] Add a real game-site Sitemap URL (a Sitemap Index is supported).
- [ ] Trigger a scan from the source row. The first successful scan creates a
      baseline and intentionally reports zero new URLs.
- [ ] Trigger a later scan after the Sitemap changes. Confirm new URLs appear
      under **Recent discovered URLs** and their final path phrases are shown.
- [ ] Add a second source on another hostname and verify a repeated phrase is
      promoted only after a post-baseline discovery on that second site.
- [ ] Temporarily use an unreachable source or trigger a failing scan, then
      confirm the source shows `FAILED` while its last successful scan and
      accepted snapshot remain unchanged.

## Deployment verification

From the repository root, run the protected endpoint checks against the deployed
URL:

```bash
DEPLOYMENT_URL=https://your-dashboard.example \
  DASHBOARD_PASSWORD='your-password' \
  node scripts/verify-deployment.js
```

After adding a source, include `VERIFY_SOURCE_ID` to exercise the same manual
scan endpoint used by the Dashboard:

```bash
DEPLOYMENT_URL=https://your-dashboard.example \
  DASHBOARD_PASSWORD='your-password' \
  VERIFY_SOURCE_ID=1 \
  node scripts/verify-deployment.js
```

The verifier checks unauthenticated rejection, password login, the HTTP-only
session cookie, authenticated source reads, and (when requested) a persisted
scan result. It does not print the password or service key.
