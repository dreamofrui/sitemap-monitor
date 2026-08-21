# Issue tracker

Issues for this repository are tracked in **GitHub Issues**.

## Creating issues

Use the `gh` CLI:

```bash
gh issue create --title "Title" --body "Description"
```

Skills like `to-tickets` and `to-spec` will create issues this way automatically.

## Listing issues

```bash
gh issue list
gh issue view <number>
```

## PRs as a request surface

PRs from external contributors are **not** automatically added to the triage queue. If you want to treat incoming PRs as requests that need triage, set this flag to `true`:

```yaml
prs_as_requests: false
```
