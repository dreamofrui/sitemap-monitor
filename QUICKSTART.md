# Hosted Sitemap Monitor Quickstart

The production runtime is GitHub Actions + Supabase + Vercel. No server or
browser Supabase client is required.

## 1. Prepare Supabase

Run `supabase/migration.sql` in the Supabase SQL editor. This creates the
hosted monitor tables, signal aggregation trigger, batch write function, and
service-role-only RLS policies.

## 2. Configure secrets

GitHub Actions needs:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

Vercel Production needs the same two values plus:

```text
DASHBOARD_PASSWORD
DASHBOARD_SESSION_SECRET
```

`SUPABASE_SERVICE_KEY` is server-side only. Do not use `NEXT_PUBLIC_*` names or
put the service key in `web/.env.local` that could be bundled for the browser.

## 3. Deploy

Import the repository into Vercel using the repository root. `vercel.json`
installs the `web` dependencies and runs the dashboard build. GitHub Actions
checks all active sources every four hours and exposes a manual **Run workflow**
trigger for the same scanner.

## 4. Add a source and establish its baseline

1. Open the deployed dashboard and sign in.
2. Open **Sitemaps**, enter a complete Sitemap URL, and add it.
3. Trigger the source scan once. The first successful scan stores the complete
   Sitemap snapshot as a baseline and emits no discoveries.
4. After a later Sitemap update, trigger another scan or wait for the schedule.
   New URLs, normalized final path phrases, source health, and cross-site
   priorities appear on the dashboard.

Run the endpoint verifier described in `DEPLOYMENT-CHECKLIST.md` after the first
deployment and after adding a source.
