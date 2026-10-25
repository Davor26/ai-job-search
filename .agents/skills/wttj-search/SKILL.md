---
name: wttj-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search Welcome to the Jungle (WTTJ) for jobs in
  France, or look up a specific WTTJ posting. Strongest for startups, scale-ups, tech, sales,
  marketing, product, data and consulting roles in France, with filters for city, contract
  (CDI, CDD, stage, alternance, freelance, VIE), remote work and early-career roles.
  Trigger phrases: Welcome to the Jungle, WTTJ, startup jobs France, offres d'emploi startup,
  emploi Paris, emploi Lyon, job à Paris, recherche d'emploi, chercher un CDI, offre CDI,
  offre de stage, alternance, jeune diplômé, poste junior, télétravail, full remote,
  business developer, chargé de mission, product manager, data analyst, scale-up, look up
  this WTTJ posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/wttj-search/cli/src/cli.ts *)
---

# Welcome to the Jungle Search Skill (France)

Search live job listings from [Welcome to the Jungle](https://www.welcometothejungle.com/fr)
through its **public JSON API**. No authentication, no API key and **zero runtime dependencies**:
it runs with just `bun`.

> WTTJ's search API is global and **ignores** its own `location` parameter, so this skill keeps
> only jobs with an office in `--country` (default **FR**) and, if given, in the `--location`
> city. France is WTTJ's home market, so French results are dense; a narrow city filter can
> still make `search` scan forward across a few API pages to fill `--limit`.

## ⚠️ Personal use only

This uses WTTJ's public API. Keep volume low, don't use it commercially or for bulk data
collection, and run it on your own responsibility.

## When to use this skill

- Search French startup, scale-up and SME job openings on WTTJ
- Filter by city (`--location Paris`), contract (`--contract cdi`) or remote policy
- Hunt early-career roles with `--junior` (junior, jeune diplômé, stage, alternance, VIE,
  or ≤1 year of experience asked)
- Keep only recent postings (`--jobage 7`)
- Read the full description of a specific WTTJ listing

## Commands

### Search job listings

```bash
bun run .agents/skills/wttj-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords. **Required** by WTTJ's API, except with
  `--junior`, which supplies a broad early-careers query.
- `--location <place>` / `-l <place>` — by default an accent- and case-insensitive match on
  the office city, so `-l evry` matches "Évry-Courcouronnes" but `-l Paris` alone misses
  Clichy, Aubervilliers or La Défense. For a commuting zone use a region or a radius:
  - `-l "Île-de-France"` (or `IDF`): 45 km around Paris; `-l "Grand Paris"`: 20 km.
  - `-l Paris --radius 15`: distance from the city centre, using each office's coordinates.
    Known centres: Paris, La Défense, Montrouge, Boulogne-Billancourt, Lyon, Marseille,
    Toulouse, Nice, Nantes, Strasbourg, Montpellier, Bordeaux, Lille, Rennes, Grenoble,
    Aix-en-Provence.
- `--radius <km>` — see above; requires `--location` set to a known centre.
- `--country <ISO2>` — office country, default `FR` (`BE`, `CH`, `LU`… also work).
- `--contract <type>` — `cdi`, `cdd`, `stage`, `alternance`, `freelance`, `vie`, `temps_partiel`.
- `--remote <mode>` — `fulltime` (full remote), `partial`, `punctual`, `no`.
- `--junior` — early-careers only (`--graduate` is accepted as an alias).
- `--jobage <days>` — keep only jobs posted within N days.
- `--page <n>` — 1-indexed API page to start scanning from (default 1).
- `--limit <n>` / `-n <n>` — cap total results (default target 50).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/wttj-search/cli/src/cli.ts detail <org/slug|url> [--format json|plain]
```

`id` is the `<org>/<slug>` reference from `search` results. A full WTTJ page or API URL also
works. Returns the description, the **candidate profile** ("profil recherché": the experience
and skills asked for, kept separate from the description, which matters for fit evaluation),
key missions, skills, tools, recruitment process, contract type, remote policy, minimum
experience, salary, start date and apply link.

## Usage examples

```bash
# Business developer roles within 15 km of central Paris (includes the inner suburbs)
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "business developer" -l Paris --radius 15 --format table

# Same role anywhere in Île-de-France
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "business developer" -l "Île-de-France" --format table

# Permanent (CDI) data analyst roles posted in the last two weeks
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "data analyst" --contract cdi --jobage 14 --format table

# Full-remote product roles anywhere in France
bun run .agents/skills/wttj-search/cli/src/cli.ts search -q "product manager" --remote fulltime -n 20

# Early-career scan in Lyon
bun run .agents/skills/wttj-search/cli/src/cli.ts search --junior -l Lyon --format plain

# Full details for one posting
bun run .agents/skills/wttj-search/cli/src/cli.ts detail <org>/<job-slug> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail`. `meta` records `country` and `location`. |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from WTTJ's public API — no credentials required.
- WTTJ pages at 10 results per API page and ignores server-side location; country, city,
  contract, remote and `--jobage` filters are all applied client-side while scanning (up to
  15 pages).
- WTTJ may rate-limit; the CLI retries 429/5xx with exponential backoff. Keep volume low.
- Job IDs are `<org>/<slug>`; pass them as-is to `detail`.
- `remote` can also be `unknown` in results; `--remote` only filters on the four known values.
- Verified against the live API on 2026-10-25 (`cli/tests/fixtures/`); contract values seen:
  `full_time`, `temporary`, `internship`, `apprenticeship`, `freelance`, `vie`, `part_time`, `other`.
- `--junior` is a title/contract/experience heuristic; WTTJ has no single "junior" field, so it
  errs toward inclusion.
- Adapted from the UK community fork's `wttj-search`
  ([anjolok1997/ai-job-search-uk](https://github.com/anjolok1997/ai-job-search-uk), MIT).
