# Hosted Sitemap Term Monitor

## Problem Statement

The current project was built around monitoring game sites, but its useful core
is broader: detect URLs that appear in a sitemap after a baseline and extract a
business phrase from the URL. The existing implementation is split between an
older Cloudflare Worker and a newer GitHub Actions/Supabase/Dashboard path. It
also keys snapshots by domain, treats game recognition as the primary result,
and does not aggregate a phrase when different sites publish matching pages at
different times.

The user needs a personal tool that can monitor many sites without maintaining a
server, identify newly observed pages, and surface phrases that multiple
distinct sites adopt after their baselines. The result should be usable in
production as the first release rather than a throwaway prototype.

## Solution

Build one hosted monitoring system using GitHub Actions for scheduled
collection, Supabase for durable state, and Vercel for a password-protected
Dashboard and server-side control endpoints.

Each configured Sitemap source is tracked independently, even when several
sources share a hostname. A first successful scan establishes that source's
baseline. Later successful scans recursively resolve Sitemap Index documents,
compare the complete page URL set with the previous accepted snapshot, and
record every newly observed URL before applying extraction rules.

The default extraction rule takes the last non-empty path segment, decodes and
normalizes it, and treats the entire segment as one business phrase. Hyphens and
underscores become spaces, so `text-to-image` and `text_to_image` normalize to
the phrase `text to image`; the phrase is never split into independent word
signals. The raw URL and raw segment remain as evidence.

A phrase becomes a permanent cross-source priority after post-baseline new URLs
containing that phrase have been discovered on at least two distinct hostnames.
The discoveries may occur minutes, hours, or days apart. Historical priority is
retained, while recent activity is tracked separately for ranking.

## User Stories

1. As the sole operator, I want to add a specific Sitemap URL, so that I can choose exactly which source is monitored.
2. As the sole operator, I want multiple Sitemap URLs on one hostname to be tracked independently, so that one source cannot overwrite another source's baseline.
3. As the sole operator, I want subdomains such as `games.example.com` and `example.com` treated as different sites, so that independent publishers are not merged accidentally.
4. As the sole operator, I want to activate and deactivate a Sitemap source, so that I can pause monitoring without losing historical evidence.
5. As the sole operator, I want the first successful scan of a source to establish a baseline, so that pre-existing pages are not falsely reported as newly published.
6. As the sole operator, I want later successful scans compared with the previous accepted snapshot, so that only newly observed URLs generate events.
7. As the sole operator, I want a failed fetch to preserve the last successful snapshot, so that a temporary outage cannot create thousands of false additions.
8. As the sole operator, I want a Sitemap Index to be recursively resolved, so that a root sitemap exposes the real page URLs from all child sitemaps.
9. As the sole operator, I want recursive sitemap processing to deduplicate URLs, so that the same page listed in multiple child sitemaps is counted once.
10. As the sole operator, I want URL fragments removed and hostnames normalized for comparison, so that equivalent URLs do not create duplicate discoveries.
11. As the sole operator, I want query parameters preserved by default, so that meaningful parameterized pages are not silently merged.
12. As the sole operator, I want the last non-empty path segment extracted as the primary phrase, so that `/zh/tools/text-to-image` produces `text to image` rather than a navigation path.
13. As the sole operator, I want hyphens and underscores normalized to spaces while preserving the complete phrase, so that `text-to-image` remains one demand phrase.
14. As the sole operator, I want the original URL, raw path segment, and normalized phrase retained together, so that every signal can be inspected and explained.
15. As the sole operator, I want generic technical or navigation paths filtered by configurable rules, so that obvious sitemap metadata and category pages do not pollute the signal list.
16. As the sole operator, I want every newly observed URL retained before filtering, so that a later rule change can recover information that was not initially classified as valuable.
17. As the sole operator, I want a phrase's total URL occurrence count, so that repeated adoption across many new pages is visible.
18. As the sole operator, I want a phrase's distinct-site count, so that one site publishing many pages cannot look like multi-site demand.
19. As the sole operator, I want a phrase to become a priority when a second distinct hostname adopts it after its own baseline, so that staggered adoption is recognized.
20. As the sole operator, I want the priority status to remain historically true, so that a previously validated signal is not forgotten merely because it becomes quiet.
21. As the sole operator, I want first-import pages excluded from cross-site signals, so that existing content does not masquerade as a new coordinated trend.
22. As the sole operator, I want source URLs behind each phrase visible on demand, so that I can verify the signal by visiting the original pages.
23. As the sole operator, I want first-seen and last-seen timestamps for phrases and URLs, so that I can distinguish long-running signals from recent activity.
24. As the sole operator, I want the Dashboard to rank priorities by distinct-site count, then occurrence count, then recency, so that cross-site adoption is more prominent than volume from one site.
25. As the sole operator, I want to see source health, baseline state, last successful scan, and recent errors, so that I can tell whether an apparent lack of new pages is trustworthy.
26. As the sole operator, I want a scheduled scan every four hours, so that monitoring runs without manual intervention.
27. As the sole operator, I want to trigger a scan manually from the Dashboard, so that I can verify a source immediately after a suspected update.
28. As the sole operator, I want the Dashboard protected by a deployment-level password, so that only I can view or change monitoring data.
29. As the sole operator, I want database service credentials kept server-side, so that browser users cannot obtain unrestricted write access.
30. As the sole operator, I want the first release deployed without maintaining a server, so that I can use the system without operating infrastructure.

## Implementation Decisions

- Use a single primary runtime based on GitHub Actions, Supabase, and Vercel. The legacy Cloudflare Worker/KV and Discord/Telegram execution path is not part of the new main flow.
- Treat a Sitemap source as a complete Sitemap URL. Treat a site as an exact normalized hostname; subdomains remain distinct sites. Use the source URL, not the hostname, as snapshot identity.
- Add durable concepts for Sitemap sources, accepted snapshots, discovered URLs, scan runs, phrase occurrences, and aggregated phrase signals. The game-centric tables are no longer the authoritative monitoring result; game recognition may remain as an optional initial classification rule.
- A source has an explicit active/inactive state. Deactivation is a soft action: collection stops, but URLs, occurrences, priorities, and aggregate history remain available and the source can be reactivated.
- A successful first scan establishes a baseline and does not emit new-URL events. A later successful scan compares the complete normalized URL set with the previous accepted set.
- A fetch or parse failure records a failed scan and preserves the last successful snapshot. Empty or suspiciously truncated results are rejected rather than accepted as a destructive replacement.
- Resolve `sitemapindex` documents recursively, follow child Sitemap URLs, support compressed Sitemap payloads, deduplicate page URLs, and enforce cycle/size/depth safety limits.
- Normalize comparison URLs by lowercasing the hostname and removing fragments. Preserve query strings by default. Apply trailing-slash handling consistently through the canonicalization policy.
- Extract the last non-empty path segment as the default phrase candidate. Decode URL encoding, normalize case, convert hyphens and underscores to spaces, collapse repeated whitespace, and retain the raw segment. The result is one complete phrase, not individual word records.
- Keep extraction and exclusion rules configurable. Port the current game's URL patterns as the first rule set, but do not make “game” the core data type or discard unclassified URLs.
- Store one occurrence per newly discovered URL and phrase. Aggregate total URL occurrences and distinct site counts separately. A site contributes at most one distinct-site count for a phrase regardless of how many Sitemap sources it owns.
- Promote a phrase to permanent cross-source priority when post-baseline occurrences exist on at least two distinct hostnames, regardless of whether scans are minutes, hours, or days apart. Track recency independently for ranking.
- Expose Dashboard read models that show prioritized phrases, distinct-site count, total URL count, first/last seen timestamps, source hostnames, and expandable evidence URLs.
- Run scheduled checks from GitHub Actions on a four-hour cadence. Provide manual invocation through a protected Vercel server-side endpoint that triggers the same scan workflow; do not duplicate scan logic in the Dashboard.
- Deploy the Dashboard through Vercel and keep Supabase service credentials in server-side/GitHub secrets. The browser must not receive the service key or unrestricted database write permissions.
- Protect the personal Dashboard with a deployment-level password and an HTTP-only secure session cookie. Do not introduce multi-user account management in the first release.
- Preserve the existing project's useful fetch/diff and Dashboard ideas, but replace the domain-keyed snapshot model, game-only result flow, direct browser writes, and split Worker/Vercel configuration with one coherent contract.

## Testing Decisions

- Test external behavior at the highest seam: one complete scan use case with controllable Sitemap responses and an isolated test database or repository adapter. Tests should assert resulting source state, snapshots, discovered URLs, phrase occurrences, and priorities rather than private helper calls.
- Cover baseline behavior: first import creates a baseline and emits no new-page signal; the second accepted scan emits only set differences.
- Cover source isolation: two Sitemap URLs on the same hostname maintain independent snapshots and cannot manufacture additions by overwriting each other.
- Cover site identity: distinct hostnames, including parent domains and subdomains, contribute separate site counts; multiple sources on one hostname contribute one site count.
- Cover staggered promotion: one site discovers a phrase on one scan, a second site discovers it on a later scan, and the phrase becomes a permanent priority.
- Cover repeated observations: a URL that remains in a Sitemap does not repeatedly generate new events; multiple new URLs on one site increase URL volume without inflating distinct-site count.
- Cover Sitemap Index recursion, nested indexes, duplicate child references, compressed payloads, cycles, malformed XML, empty results, and size/depth safety limits.
- Cover URL canonicalization and phrase extraction for encoded text, case differences, fragments, trailing slashes, query strings, hyphens, underscores, empty path segments, and technical/navigation exclusions.
- Cover failure safety: HTTP errors, timeouts, parse failures, and suspiciously truncated responses leave the last successful snapshot intact and produce visible run errors.
- Cover soft deactivation and reactivation without deleting historical URL or phrase evidence.
- Cover the protected Dashboard contract: unauthenticated requests cannot read or mutate private data; authenticated requests can view sources, priorities, evidence, and trigger a scan.
- The repository currently has no established automated test suite for this flow, so add tests around the scan seam and pure URL-rule seam rather than copying tests for the obsolete Worker path.

## Out of Scope

- Fetching page HTML, titles, descriptions, structured data, or body content.
- AI classification, semantic demand judgment, or automatic product recommendations.
- Treating individual words inside a phrase as independent demand signals.
- Discord integration, multi-channel notification orchestration, and notification delivery as a core release requirement.
- A self-maintained VPS, Docker operations, database backups, or custom server monitoring.
- Multi-user accounts, roles, invitations, or OAuth identity management.
- Replaying all historical URLs through newly introduced extraction-rule versions in the first release.
- Treating first-import content as evidence of recent publication.
- Physical deletion of source history or phrase evidence through the Dashboard.
- Arbitrary web crawling outside Sitemap documents.

## Further Notes

- The current repository contains two divergent architectures and contradictory deployment instructions. Implementation should converge on the hosted scheduled-monitoring architecture before adding new features.
- Raw Sitemap documents may have shorter retention than discovered URL and phrase evidence; the latter are the durable audit trail.
- A cross-source priority is a strong competitive signal, not proof of market demand. The Dashboard should label it as a signal and expose the source evidence.
- The first production milestone is a usable end-to-end monitor for game sites using the generic phrase model. Additional site-specific extraction rules can be added without changing the source/snapshot/occurrence model.
