# Sitemap Monitor Dashboard

This Next.js app is the protected operator surface for the hosted Sitemap
monitor. It reads and mutates data only through authenticated server-side API
routes; it does not create a browser Supabase client.

## Local development

From the repository root:

```bash
npm install
npm --prefix web install
```

Create `web/.env.local` with server-only values:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DASHBOARD_PASSWORD=choose-a-deployment-password
DASHBOARD_SESSION_SECRET=use-a-long-random-secret
```

Then run:

```bash
npm --prefix web run dev
```

## Production

Deploy from the repository root with the checked-in `vercel.json`. Configure the
four variables above in Vercel Production. Do not configure
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the service key
must remain in server-side environment variables and all data routes require
the HTTP-only deployment session.

See [`../DEPLOYMENT-CHECKLIST.md`](../DEPLOYMENT-CHECKLIST.md) for Supabase
migration, GitHub Actions, first-baseline, and verification steps.
