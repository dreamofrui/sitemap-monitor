# Dashboard Summary

The Dashboard is the private operator surface for the hosted Sitemap monitor.
It is a Next.js application under `web/` and is deployed through the root
Vercel project configuration.

## Operator views

- **Dashboard** shows source health, baselines, recent discovered URLs, and
  ranked demand signals.
- **Sitemaps** adds complete Sitemap URLs, runs a source scan, and pauses or
  reactivates sources without deleting their history.
- **Games** retains the legacy game read model for existing data; it is not the
  authoritative hosted monitor result.
- **Demand signals** show normalized final path phrases, distinct hostnames,
  occurrence counts, timestamps, and expandable evidence URLs.

## Request boundary

The browser calls protected Next.js API routes only. Those routes validate the
deployment session cookie and then use `SUPABASE_SERVICE_KEY` server-side. No
`NEXT_PUBLIC_SUPABASE_*` variable or Supabase service key is bundled into the
client.

## Local development

From the repository root:

```bash
npm --prefix web install
npm --prefix web run dev
```

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DASHBOARD_PASSWORD`, and
`DASHBOARD_SESSION_SECRET` in `web/.env.local`.

For production migration and verification, follow
[`DEPLOYMENT-CHECKLIST.md`](DEPLOYMENT-CHECKLIST.md).
