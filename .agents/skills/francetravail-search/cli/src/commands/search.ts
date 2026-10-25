import {
  API,
  apiGet,
  buildRange,
  getToken,
  mapCard,
  parseTotal,
  publieeDepuisFor,
  readCredentials,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  departement?: string
  commune?: string
  distance?: number
  contract?: string // comma-separated typeContrat codes
  alternance?: boolean
  experience?: string // 1 | 2 | 3
  fullTime?: boolean
  sort: "date" | "relevance"
  jobage?: number
  page: number
  perPage: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Build the query string for /offres/search. Exported for tests. */
export function buildSearchParams(opts: SearchOpts): URLSearchParams {
  const p = new URLSearchParams()
  if (opts.query) p.set("motsCles", opts.query)
  if (opts.departement) p.set("departement", opts.departement)
  if (opts.commune) {
    p.set("commune", opts.commune)
    if (opts.distance !== undefined) p.set("distance", String(opts.distance))
  }
  if (opts.contract) p.set("typeContrat", opts.contract)
  // Apprenticeship (E2) and professionalisation (FS) contracts are a contract *nature*, not a type.
  if (opts.alternance) p.set("natureContrat", "E2,FS")
  if (opts.experience) p.set("experience", opts.experience)
  if (opts.fullTime) p.set("tempsPlein", "true")
  if (opts.jobage !== undefined) {
    const d = publieeDepuisFor(opts.jobage)
    if (d !== null) p.set("publieeDepuis", String(d))
  }
  // sort=1: newest first; sort=0: relevance first.
  p.set("sort", opts.sort === "relevance" ? "0" : "1")
  p.set("range", buildRange(opts.page, opts.perPage))
  return p
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "Aucun résultat."
  const header =
    "TITLE".padEnd(40) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(22) + " " + "CONTRACT".padEnd(12) + " DATE"
  const rows = cards.map(
    (c) =>
      `${c.title.slice(0, 40).padEnd(40)} ${(c.company || "—").slice(0, 22).padEnd(22)} ${(c.location || "—")
        .slice(0, 22)
        .padEnd(22)} ${(c.contract || "—").slice(0, 12).padEnd(12)} ${(c.date || "—").slice(0, 10)}`,
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const creds = readCredentials()
  const token = await getToken(creds)
  const url = `${API}/search?${buildSearchParams(opts).toString()}`
  const res = await apiGet(url, token)
  const raws: any[] = Array.isArray(res.body?.resultats) ? res.body.resultats : []

  let cards = raws.map(mapCard).filter((c) => c.id)
  // publieeDepuis only takes 1/3/7/14/31 days; apply the exact cutoff client-side.
  if (opts.jobage !== undefined) {
    const cutoff = Date.now() - opts.jobage * 86400000
    cards = cards.filter((c) => {
      const t = c.date ? Date.parse(c.date) : NaN
      return isNaN(t) || t >= cutoff
    })
  }
  if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

  if (opts.format === "table") {
    process.stdout.write(renderTable(cards) + "\n")
  } else if (opts.format === "plain") {
    process.stdout.write(
      cards
        .map(
          (c) =>
            `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.contract || "—"} · ${c.salary || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
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
            perPage: opts.perPage,
            total: parseTotal(res.contentRange),
            hasMore: res.status === 206,
          },
          results: cards,
        },
        null,
        2,
      ) + "\n",
    )
  }
  return 0
}
