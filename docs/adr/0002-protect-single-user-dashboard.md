# Protect the dashboard as a single-user private tool

**Status: proposed**

The dashboard is intended for one operator, so the first release will use a
deployment-level password and an HTTP-only session rather than a full account
system. Supabase service credentials stay in server-side secrets, and browser
requests never receive permission to write directly with the service key; this
keeps the personal tool private without adding multi-user identity management.
