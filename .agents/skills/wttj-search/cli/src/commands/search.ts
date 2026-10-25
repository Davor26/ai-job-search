import {
  SEARCH_URL,
  jsonFetch,
  mapCard,
  inCountry,
  inCity,
  nearPoint,
  isJunior,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  /** When set, --location is matched by distance instead of by city name. */
  near?: { center: [number, number]; km: number }
  country: string
  contract?: string // normalized WTTJ contract_type
  remote?: string
  jobage: number
  junior?: boolean
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

// WTTJ requires a job_title; with no query, --junior falls back to a broad early-careers query.
const JUNIOR_QUERY = "junior"

// WTTJ ignores server-side location, so filtering is client-side. France is WTTJ's home
// market, so FR hits are dense; a city filter can still be sparse, hence the scan.
const MAX_PAGES = 15

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Aucun résultat."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const contract = (c.contractType || "—").slice(0, 14).padEnd(14)
    const date = (c.date || "—").slice(0, 10)
    return `${title} ${company} ${loc} ${contract} ${date}`
  })
  const header =
    "TITLE".padEnd(38) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(16) + " " + "CONTRACT".padEnd(14) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const query = opts.query || (opts.junior ? JUNIOR_QUERY : "")
    if (!query) {
      writeError(
        "WTTJ search needs a --query (its API requires a job_title). Use --junior for a broad early-careers scan.",
        "NO_QUERY",
      )
      return 1
    }

    const want = opts.limit !== undefined && opts.limit >= 0 ? opts.limit : 50
    const seen = new Set<string>()
    let cards: JobCard[] = []
    const cutoff = opts.jobage < 9999 ? Date.now() - opts.jobage * 86400000 : null

    for (let i = 0; i < MAX_PAGES && cards.length < want; i++) {
      const page = opts.page + i
      const url = `${SEARCH_URL}?job_title=${encodeURIComponent(query)}&page=${page}`
      const body = await jsonFetch(url)
      const data: any[] = Array.isArray(body?.data) ? body.data : []
      if (data.length === 0) break

      for (const raw of data) {
        if (!inCountry(raw, opts.country)) continue
        if (opts.near) {
          if (!nearPoint(raw, opts.near.center, opts.near.km, opts.country)) continue
        } else if (opts.location && !inCity(raw, opts.location, opts.country)) continue
        const card = mapCard(raw, opts.country)
        if (seen.has(card.id)) continue
        if (opts.contract && (card.contractType || "").toLowerCase() !== opts.contract) continue
        if (opts.remote && (card.remote || "").toLowerCase() !== opts.remote) continue
        if (opts.junior && !isJunior(card)) continue
        if (cutoff !== null && card.date) {
          const t = Date.parse(card.date)
          if (!isNaN(t) && t < cutoff) continue
        }
        seen.add(card.id)
        cards.push(card)
      }

      const pageCount = body?.metadata?.page_count
      if (typeof pageCount === "number" && page >= pageCount) break
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.contractType || "—"} · ${c.salary || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              country: opts.country,
              location: opts.location ?? null,
              radiusKm: opts.near?.km ?? null,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
