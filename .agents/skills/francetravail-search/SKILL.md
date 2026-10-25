---
name: francetravail-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search job offers in France through France Travail
  (formerly Pôle emploi), the French public employment service, or look up a France Travail
  offer. It is the broadest French source: every sector, every region, all contract types,
  including offers relayed from partner job boards. Supports keyword, département, city with
  radius, contract type (CDI, CDD, intérim, saisonnier, freelance), alternance, experience
  level, full-time and posting age. Trigger phrases: France Travail, Pôle emploi, offres
  d'emploi, recherche d'emploi France, trouver un emploi, chercher un CDI, offre CDD,
  intérim, alternance, emploi Paris, emploi Île-de-France, emploi Hauts-de-Seine, emploi
  Lyon, emploi Marseille, job France, French jobs, jobs in France, code ROME, offre
  francetravail.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/francetravail-search/cli/src/cli.ts *)
---

# France Travail Search Skill

Search live job offers through the official **France Travail "Offres d'emploi v2" API**: the
public employment service's own feed, covering every sector and region of France and the
offers its partner job boards relay. **Zero runtime dependencies**: it runs with just `bun`.

## Setup (once, free)

This is an official API, so it needs credentials. They are free and the API itself is not
billed.

1. Create an account on [francetravail.io](https://francetravail.io) and declare an application.
2. Subscribe that application to the **"Offres d'emploi v2"** API.
3. Export the two values it gives you (add them to your shell profile so they persist):

```bash
export FRANCE_TRAVAIL_CLIENT_ID="..."
export FRANCE_TRAVAIL_CLIENT_SECRET="..."
```

The CLI reads them **only** from these environment variables. Never pass them as flags or
write them into a file in this repo. If they are unset, every command exits with
`MISSING_CREDENTIALS` before sending anything.

## When to use this skill

- Search French job offers by keyword, département, city or contract type
- Cover sectors and regions the startup-heavy boards miss (SMEs, public bodies, regional employers)
- Find alternance (apprenticeship / professionalisation) contracts
- Read the full offer: description, required vs desired skills, education, languages, salary

## Commands

### Search offers

```bash
bun run .agents/skills/francetravail-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords, e.g. `"business developer"`, `"comptable"`.
- `--location <place>` / `-l <place>` — a département code (`75`), up to five (`92,93,94`),
  an **INSEE** commune code (`92049` for Montrouge — not the postal code), or a known name:
  `Paris`, `Île-de-France`, `Hauts-de-Seine`, `Lyon`, `Marseille`, `Toulouse`, `Nantes`,
  `Bordeaux`, `Lille`, `Rennes`, `Strasbourg`, `Montpellier`, `Nice`.
- `--distance <km>` — radius around a commune (not used with départements).
- `--contract <types>` — `cdi`, `cdd`, `interim`, `saisonnier`, `freelance`, `franchise`; comma-separated.
- `--alternance` — apprenticeship and professionalisation contracts only.
- `--experience <1|2|3>` — less than 1 year, 1 to 3 years, more than 3 years.
- `--full-time` — full-time only.
- `--jobage <days>` — posted within N days.
- `--sort date|relevance` — default `date` (newest first).
- `--page <n>`, `--per-page <n>` (1-150, default 50), `--limit <n>` / `-n <n>`.
- `--format json|table|plain` — default `json`.

### Full offer detail

```bash
bun run .agents/skills/francetravail-search/cli/src/cli.ts detail <offerId|url> [--format json|plain]
```

`offerId` is the `id` from `search` results (e.g. `201ABCD`); a
`candidat.francetravail.fr/offres/recherche/detail/...` URL also works.

## Usage examples

```bash
# Permanent business-developer roles in Paris
bun run .agents/skills/francetravail-search/cli/src/cli.ts search -q "business developer" -l Paris --contract cdi --format table

# Sales roles in Hauts-de-Seine and Paris posted this week
bun run .agents/skills/francetravail-search/cli/src/cli.ts search -q "chargé d'affaires" -l "92,75" --jobage 7 --format table

# Accounting roles within 20 km of Lyon, best matches first
bun run .agents/skills/francetravail-search/cli/src/cli.ts search -q "comptable" -l Lyon --distance 20 --sort relevance --format table

# Alternance offers in marketing across Île-de-France
bun run .agents/skills/francetravail-search/cli/src/cli.ts search -q "marketing" -l "Île-de-France" --alternance --format table

# Experienced profiles only, full time
bun run .agents/skills/francetravail-search/cli/src/cli.ts search -q "consultant" -l 75 --experience 3 --full-time -n 20

# Full offer
bun run .agents/skills/francetravail-search/cli/src/cli.ts detail 201ABCD --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — passing IDs to `detail`. `meta.total` is the API's total match count, `meta.hasMore` tells whether another page exists. |
| `table` | Quick human-readable overview |
| `plain` | Reading one offer (`detail`) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`
(`MISSING_CREDENTIALS`, `AUTH_FAILED`, `BAD_ARG`, `BAD_QUERY`, `NOT_FOUND`, …).

## Notes

- The API serves at most the first **1,150 results** of a query (start index ≤ 1000). Narrow
  the query (keywords, département, contract, `--jobage`) rather than paging deeper; the CLI
  refuses pages past that limit.
- `--jobage` maps to the API's `publieeDepuis`, which only accepts 1, 3, 7, 14 or 31 days; the
  CLI rounds up and then applies the exact cutoff itself. Beyond 31 days, filtering is client-side only.
- `commune` needs an INSEE code, which differs from the postal code (Montrouge: postal 92120,
  INSEE 92049). Paris is searched by département 75 because its INSEE codes are per arrondissement.
- Offers relayed from partner sites carry the partner's link in `applyUrl`.
- Rate limit is about 10 calls per second; the CLI makes two calls per command (token, then
  query) and retries 429/5xx with exponential backoff.
