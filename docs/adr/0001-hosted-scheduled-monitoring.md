# Use hosted components instead of a self-maintained server

**Status: accepted**

The monitor will use GitHub Actions for scheduled sitemap checks, Supabase for
durable storage, and Vercel for the private-use dashboard. This avoids operating
and securing a server while preserving a clear separation between scheduled
collection, persistence, and presentation; the trade-off is dependence on three
hosted services and their limits.
