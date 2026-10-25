# wttj-cli

CLI for searching jobs on [Welcome to the Jungle](https://www.welcometothejungle.com) (WTTJ,
formerly **Otta**) — strong for startup / scale-up and tech roles, with a `--graduate` mode
for early-career hunting.

**Data source**: WTTJ public JSON API (`/api/v3/public/jobs` search, `/api/v3/organizations/<org>/jobs/<slug>` detail).
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.
**France targeting**: WTTJ's API is global and ignores its own location param, so results are filtered client-side to offices in `--country` (default **FR**) and optionally a `--location` city.

> **Personal use only.** This uses WTTJ's public API. Keep volume low, don't use it commercially
> or for bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/wttj-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search job listings in France (country/city/contract/remote filters); `--junior` for early-career only |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Business developer roles in Paris
bun run src/cli.ts search -q "business developer" -l Paris --format table

# CDI data analyst roles posted in the last 14 days
bun run src/cli.ts search -q "data analyst" --contract cdi --jobage 14 --format table

# Broad early-career scan in Lyon (no query needed)
bun run src/cli.ts search --junior -l Lyon -n 20 --format plain

# Full detail for one job
bun run src/cli.ts detail <org>/<job-slug> --format plain
```

See `../SKILL.md` for the full flag reference and the personal-use note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Required unless `--junior` is used. |
| `--location` | `-l` | Keep jobs with an office in this city (accent/case-insensitive). |
| `--country` | | Office country, ISO 2-letter code. Default `FR`. |
| `--contract` | | `cdi` \| `cdd` \| `stage` \| `alternance` \| `freelance` \| `vie` \| `temps_partiel`. |
| `--remote` | | `fulltime` \| `partial` \| `punctual` \| `no`. |
| `--junior` | | Early-careers only (junior / jeune diplômé / stage / alternance / VIE / ≤1 yr). Alias `--graduate`. |
| `--jobage` | | Keep only jobs posted within N days (client-side). |
| `--page` | | 1-indexed API page to start scanning from (10/page). |
| `--limit` | `-n` | Cap results emitted (default target 50). |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun test            # unit (mapping, country/city filters, contract aliases, junior heuristic, id parsing) + CLI flag-validation
bun run typecheck   # tsc --noEmit
```
