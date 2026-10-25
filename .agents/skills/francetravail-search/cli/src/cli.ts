#!/usr/bin/env bun
// CLI for the official France Travail "Offres d'emploi v2" API.
// Credentials come only from FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET.
// Zero runtime dependencies.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { CliError, MAX_PER_PAGE, contractCodes, resolveLocation, writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["alternance", "full-time", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (BOOLEAN_FLAGS.has(key) || next === undefined || (next.startsWith("-") && !/^-\d/.test(next))) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `francetravail-cli — search the official France Travail job-offers API

SETUP (once)
  Create a free app on https://francetravail.io, subscribe it to "Offres d'emploi v2", then:
    export FRANCE_TRAVAIL_CLIENT_ID=...
    export FRANCE_TRAVAIL_CLIENT_SECRET=...

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <offerId|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (motsCles), e.g. "commercial B2B".
  --location, -l <place>  Département code(s) ("75", "92,93"), an INSEE commune code
                          ("92049"), or a known name: Paris, Île-de-France, Lyon, Marseille,
                          Toulouse, Nantes, Bordeaux, Lille, Rennes, Strasbourg, Montpellier, Nice.
  --distance <km>         Radius around a commune (ignored for départements).
  --contract <types>      cdi, cdd, interim, saisonnier, freelance, franchise (comma-separated).
  --alternance            Apprenticeship / professionalisation contracts only.
  --experience <level>    1 = < 1 year, 2 = 1-3 years, 3 = > 3 years.
  --full-time             Full-time positions only.
  --jobage <days>         Posted within N days.
  --sort <order>          date (default) | relevance.
  --page <n>              1-indexed page. Default 1.
  --per-page <n>          Results per API call, 1-150. Default 50.
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "business developer" -l Paris --contract cdi --format table
  bun run src/cli.ts search -q "chargé d'affaires" -l "92,75" --jobage 7 --format table
  bun run src/cli.ts search -q "comptable" -l Lyon --distance 20 --sort relevance
  bun run src/cli.ts detail <offerId> --format plain
`

function bad(msg: string): never {
  throw new CliError(msg, "BAD_ARG")
}

function wholeNumber(flags: Flags, key: string): number | undefined {
  const raw = flags[key]
  if (raw === undefined) return undefined
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    bad(`--${key} must be a non-negative whole number, got "${raw === true ? "(missing value)" : String(raw)}"`)
  }
  return parseInt(raw, 10)
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const jobage = wholeNumber(flags, "jobage")
    const page = wholeNumber(flags, "page") ?? 1
    const perPage = wholeNumber(flags, "per-page") ?? 50
    const limit = wholeNumber(flags, "limit")
    const distance = wholeNumber(flags, "distance")
    if (page < 1) bad("--page starts at 1")
    if (perPage < 1 || perPage > MAX_PER_PAGE) bad(`--per-page must be between 1 and ${MAX_PER_PAGE}`)

    let departement: string | undefined
    let commune: string | undefined
    if (flags.location !== undefined) {
      const loc = typeof flags.location === "string" ? resolveLocation(flags.location) : null
      if (!loc) {
        bad(
          `Unknown --location "${String(flags.location)}": use a département code ("75"), an INSEE commune code ("92049") or one of the listed city names`,
        )
      }
      departement = loc.departement
      commune = loc.commune
    }
    if (distance !== undefined && !commune) bad("--distance only applies to a commune (an INSEE code or a city like Lyon)")

    let contract: string | undefined
    if (flags.contract !== undefined) {
      const c = typeof flags.contract === "string" ? contractCodes(flags.contract) : null
      if (!c) bad(`--contract must be among cdi, cdd, interim, saisonnier, freelance, franchise; got "${String(flags.contract)}"`)
      contract = c
    }

    let experience: string | undefined
    if (flags.experience !== undefined) {
      if (typeof flags.experience !== "string" || !["1", "2", "3"].includes(flags.experience)) {
        bad("--experience must be 1 (< 1 year), 2 (1-3 years) or 3 (> 3 years)")
      }
      experience = flags.experience
    }

    const sort = flags.sort === undefined ? "date" : String(flags.sort)
    if (sort !== "date" && sort !== "relevance") bad(`--sort must be date or relevance, got "${sort}"`)

    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "table", "plain"].includes(fmt)) bad(`--format must be json, table or plain, got "${fmt}"`)

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      departement,
      commune,
      distance,
      contract,
      alternance: flags.alternance === true,
      experience,
      fullTime: flags["full-time"] === true,
      sort: sort as SearchOpts["sort"],
      jobage,
      page,
      perPage,
      limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) throw new CliError("detail requires an <offerId|url>", "NO_ID")
    const fmt = typeof flags.format === "string" ? flags.format : "json"
    const opts: DetailOpts = { id, format: fmt === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  throw new CliError(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    if (e instanceof CliError) writeError(e.message, e.code)
    else writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
