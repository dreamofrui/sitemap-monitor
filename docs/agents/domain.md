# Domain documentation

This repository uses a **single-context** layout.

## Structure

- **`CONTEXT.md`** at the repo root — glossary, scope boundaries, and domain concepts
- **`docs/adr/`** — Architecture Decision Records

## Consumer rules

When you need domain context:

1. **Read `CONTEXT.md` first** — it defines the core concepts, terminology, and scope boundaries for this project.
2. **Check `docs/adr/`** for architectural decisions — each ADR documents a specific technical choice and its rationale.
3. **Use the glossary** — `CONTEXT.md` contains precise definitions of domain terms. When uncertain about terminology (sitemap source, baseline, new URL, term occurrence, etc.), refer to it.
4. **Respect scope boundaries** — `CONTEXT.md` explicitly states what is in scope and out of scope. Don't assume features or behaviors outside these boundaries.

## When to update

- **Update `CONTEXT.md`** when domain concepts change, new terminology emerges, or scope boundaries shift.
- **Create an ADR** when making significant architectural decisions that future maintainers need to understand.
