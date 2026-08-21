# Sitemap Monitor Context

## Purpose

The system monitors specific sitemap sources and identifies URLs that were not
present in the previous observation. It retains the original URL as evidence and
extracts words from the URL structure for later filtering and analysis.

## Glossary

### Sitemap source

A specific sitemap URL being monitored. A source is identified by its complete
URL, not only by its domain. One domain may have multiple independent sources.

### Site

A normalized hostname such as `example.com` or `games.example.com`. Different
hostnames are different sites, including a subdomain and its parent domain.
Multiple sitemap sources on the same hostname belong to one site for aggregate
counts.

### Observation

One successful retrieval of a sitemap source and the set of URLs found in it.

### Baseline

The first accepted observation used as the comparison starting point. A
baseline does not prove that its URLs were newly published by the website.

### New URL

A URL present in the current observation but absent from the previous accepted
observation for the same sitemap source.

### URL token

A word-like value extracted from a URL path according to an extraction rule.
The original URL remains authoritative. A token may be a complete trailing path
segment such as `text-to-image`, rather than words split on every punctuation
mark.

The core result is a complete business phrase, not the individual words inside
that phrase. URL separators such as `-` and `_` are rendered as spaces in the
canonical phrase (`text-to-image` becomes `text to image`) without creating
three separate term records.

### Term occurrence

One extracted term attached to one newly discovered URL and its sitemap source.
Occurrences retain their source evidence so the same term can be compared across
different sites.

### Cross-source term signal

A term that occurs in newly discovered URLs from multiple distinct sites after
those sources have established their baselines. The occurrences may be
discovered in different scans and at different times; a later occurrence on a
second site strengthens the signal just as much as an occurrence found in the
same scan.

The first post-baseline site occurrence is an ordinary signal. The second
distinct-site occurrence promotes the term to a cross-source priority. Further
distinct sites strengthen it further. A source's initial baseline import never
counts as a newly published occurrence.

Signals retain cumulative history and may also expose recency for ranking, but
they are not limited to a single scan window.

Once a term has been observed on at least two distinct sites through
post-baseline discoveries, its cross-source priority is permanent. Recency is a
separate ranking signal and does not erase the historical priority.

### Extraction rule

A named, repeatable policy that selects URL parts and splits them into tokens or
phrases. A game-site rule is one possible rule set, not the definition of the
whole system.

### Page content

The title, body, metadata, or other content retrieved from the page URL. Page
content is outside the core monitoring purpose unless explicitly added later.

## Scope boundaries

- The core result is a newly observed URL, not a claim that the website just
  published that page.
- New URLs are retained before any rule-based filtering.
- Token extraction is based on URL structure; page fetching and AI analysis are
  not part of the core flow.
- A domain groups sources for display, but does not identify a source snapshot.
- The default useful value is the trailing business path segment; language or
  category segments earlier in the path remain available as context.
- A term is aggregated across distinct sites, while the underlying URL
  occurrences remain available for inspection.
- A cross-source signal is built from post-baseline discoveries over time, not
  only from discoveries in one scan batch.
- URL occurrences are durable evidence; raw Sitemap documents may have a
  shorter retention period than discovered-page and term records.
