# francetravail-cli

CLI for the official [France Travail](https://francetravail.io) "Offres d'emploi v2" API — the
French public employment service's job-offer feed.

**Authentication**: free OAuth client credentials, read from `FRANCE_TRAVAIL_CLIENT_ID` and
`FRANCE_TRAVAIL_CLIENT_SECRET` (see `../SKILL.md` → Setup).
**Dependencies**: none at runtime (plain `bun` + `fetch`). `bun install` only pulls dev type defs.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search offers by keyword, département/city, contract, alternance, experience, age |
| `detail` | Full offer: description, skills, education, languages, salary, apply link |

## Quick examples

```bash
export FRANCE_TRAVAIL_CLIENT_ID=... FRANCE_TRAVAIL_CLIENT_SECRET=...
bun run src/cli.ts search -q "business developer" -l Paris --contract cdi --format table
bun run src/cli.ts search -q "comptable" -l Lyon --distance 20 --sort relevance
bun run src/cli.ts detail <offerId> --format plain
```

## Tests

```bash
bun test            # unit (mapping, query building, ranges, locations) + flag validation; no network
bun run typecheck   # tsc --noEmit
```

Live check after setting the credentials:

```bash
bun run src/cli.ts search -q "commercial" -l 75 --limit 5 --format table
```
