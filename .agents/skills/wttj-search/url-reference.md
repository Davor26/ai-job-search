# Welcome to the Jungle (WTTJ / ex-Otta) API Reference

Public, unauthenticated JSON API used by this skill. Global board; this skill filters to France (`--country`, default FR).

> Personal use only — keep volume low.

## Search

```
GET https://api.welcometothejungle.com/api/v3/public/jobs
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `job_title` | Free-text query | `data engineer` |
| `page` | 1-indexed page (10 results/page) | `1`, `2`, `3`, … |
| `location` | **Accepted but ignored** — results stay global | — |

Returns `{ data: [...], metadata: { total, page, per_page, page_count } }`. Each job carries
`name`, `slug`, `organization{ name, slug }`, `office{ city, country_code }` + `offices[]`,
`contract_type`, `remote`, `published_at`, `experience_min`/`experience_max`, and
`salary_min`/`salary_max`/`salary_currency`/`salary_period` (often null). **No description**
in the search payload.

Because `location` is ignored, the CLI filters client-side to jobs with an office in the
requested country (`office.country_code` or any `offices[].country_code`, default `FR`) and,
with `--location`, whose city matches (accent/case-insensitive). `--contract` compares against
`contract_type` (`full_time`, `temporary`, `internship`, `apprenticeship`, `freelance`, …) and
`--remote` against `remote` (`fulltime`, `partial`, `punctual`, `no`). It scans forward across
pages to fill `--limit`.

## Detail

```
GET https://api.welcometothejungle.com/api/v3/organizations/<orgSlug>/jobs/<jobSlug>
```

Returns `{ job: { ... } }`. The org-scoped endpoint (keyed by the `<org>/<slug>` reference
from a search result) is the one that resolves — the bare `/public/jobs/<id>` form 404s and
the public HTML page is bot-blocked. Adds the rich HTML `description` (flattened to text),
`education_level`, and `apply_url` on top of the search fields.

## Apply

```
<job>.apply_url   (from detail)
```

Surfaced as `applyUrl` in `detail` output; falls back to the public listing URL.

## Public listing URL

```
https://www.welcometothejungle.com/fr/companies/<orgSlug>/jobs/<jobSlug>
```

Surfaced as `url` on every card (human-viewable; not what the CLI fetches).

## Notes

- No authentication required.
- Respect rate limits — the CLI backs off on 429/5xx.
- Global board: the country, city, contract, remote and `--junior` filters are applied client-side by the CLI.
- The exact `contract_type` values were documented by the UK fork; confirm the French ones on a first live run and extend `CONTRACT_ALIASES` in `cli/src/helpers.ts` if WTTJ uses others.
