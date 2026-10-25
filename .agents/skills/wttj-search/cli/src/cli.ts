#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Welcome to the Jungle via its public JSON API.
// France-focused: results are filtered client-side to offices in --country (default FR),
// because WTTJ ignores its own server-side location param. No auth, zero runtime deps.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { PLACE_COORDS, REGION_RADIUS, normalizeContract, placeKey, writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const BOOLEAN_FLAGS = new Set(["junior", "graduate", "help", "h"])

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      // A dash-led token is another flag, EXCEPT a negative number, which we capture as
      // this flag's value so the numeric guard can reject it with the actual bad value.
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

const HELP = `wttj-cli — search jobs on Welcome to the Jungle (France by default)

USAGE
  bun run src/cli.ts search --query "<text>" [flags]
  bun run src/cli.ts detail <org/slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). Required by WTTJ's API.
  --location, -l <place>  City name (accent/case-insensitive substring of the office city),
                          or a region: "Île-de-France" / "IDF" (45 km around Paris),
                          "Grand Paris" (20 km).
  --radius <km>           Distance around --location instead of a name match. Works for
                          Paris, La Défense, Montrouge, Boulogne-Billancourt, Lyon, Marseille,
                          Toulouse, Nice, Nantes, Strasbourg, Montpellier, Bordeaux, Lille,
                          Rennes, Grenoble, Aix-en-Provence.
  --country <ISO2>        Office country to keep. Default FR (BE, CH, LU, ES… also work).
  --contract <type>       cdi | cdd | stage | alternance | freelance | vie | temps_partiel
                          (or WTTJ's own: full_time, temporary, internship, apprenticeship…)
  --remote <mode>         fulltime | partial | punctual | no
  --junior                Early-careers only: junior / jeune diplômé / stage / alternance /
                          VIE titles or contracts, or ≤1 year of experience asked.
                          Works with no --query as a broad scan. (--graduate is an alias.)
  --jobage <days>         Keep only jobs posted within N days. Default: all.
  --page <n>              1-indexed API page to start scanning from. Default 1.
  --limit, -n <n>         Cap results emitted. Default target 50.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "business developer" -l Paris --radius 15 --format table
  bun run src/cli.ts search -q "business developer" -l "Île-de-France" --format table
  bun run src/cli.ts search -q "data analyst" --contract cdi --jobage 14 --format table
  bun run src/cli.ts search -q "product manager" --remote fulltime -n 20
  bun run src/cli.ts search --junior -l Lyon --format plain
  bun run src/cli.ts detail <org>/<job-slug> --format plain

Uses the WTTJ public API. Personal use only; keep volume low.
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"

    // Numeric filter flags must be non-negative whole numbers (reject "2.5" and "-5").
    for (const key of ["jobage", "page", "limit", "radius"]) {
      const raw = flags[key]
      if (raw === undefined) continue
      if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
        const shown = raw === true ? "(missing value)" : String(raw)
        writeError(`--${key} must be a non-negative whole number, got "${shown}"`, "BAD_ARG")
        return 1
      }
    }

    const country = typeof flags.country === "string" ? flags.country.toUpperCase() : "FR"
    if (!/^[A-Z]{2}$/.test(country)) {
      writeError(`--country must be a 2-letter ISO code (e.g. FR), got "${String(flags.country)}"`, "BAD_ARG")
      return 1
    }

    let contract: string | undefined
    if (flags.contract !== undefined) {
      const c = typeof flags.contract === "string" ? normalizeContract(flags.contract) : null
      if (!c) {
        writeError(
          `--contract must be one of cdi, cdd, stage, alternance, freelance, vie, temps_partiel; got "${String(flags.contract)}"`,
          "BAD_ARG",
        )
        return 1
      }
      contract = c
    }

    let remote: string | undefined
    if (flags.remote !== undefined) {
      const r = typeof flags.remote === "string" ? flags.remote.toLowerCase() : ""
      if (!["fulltime", "partial", "punctual", "no"].includes(r)) {
        writeError(`--remote must be fulltime, partial, punctual or no; got "${String(flags.remote)}"`, "BAD_ARG")
        return 1
      }
      remote = r
    }

    const location = typeof flags.location === "string" ? flags.location : undefined
    const radius = typeof flags.radius === "string" ? parseInt(flags.radius, 10) : undefined
    let near: SearchOpts["near"]
    if (location) {
      const key = placeKey(location)
      const region = REGION_RADIUS[key] ?? REGION_RADIUS[key.replace(/ /g, "-")]
      if (region) {
        near = { center: PLACE_COORDS[region.center], km: radius ?? region.km }
      } else if (radius !== undefined) {
        const center = PLACE_COORDS[key] ?? PLACE_COORDS[key.replace(/ /g, "-")]
        if (!center) {
          writeError(
            `--radius needs a known place for --location (${Object.keys(PLACE_COORDS).join(", ")}), got "${location}"`,
            "BAD_ARG",
          )
          return 1
        }
        near = { center, km: radius }
      }
    } else if (radius !== undefined) {
      writeError("--radius needs --location", "BAD_ARG")
      return 1
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location,
      near,
      country,
      contract,
      remote,
      jobage: typeof flags.jobage === "string" ? parseInt(flags.jobage, 10) : 9999,
      junior: flags.junior === true || flags.graduate === true,
      page: typeof flags.page === "string" ? Math.max(1, parseInt(flags.page, 10)) : 1,
      limit: typeof flags.limit === "string" ? parseInt(flags.limit, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires an <org/slug|url>", "NO_ID")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
