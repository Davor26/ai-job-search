// Data source: Welcome to the Jungle public JSON API. No auth, no key.
// Search:  GET https://api.welcometothejungle.com/api/v3/public/jobs?job_title=<q>&page=<n>
//          (per_page is fixed at 10; the `location` param is accepted but ignored,
//           so country/city targeting is a client-side filter on the job's offices.)
// Detail:  GET https://api.welcometothejungle.com/api/v3/organizations/<org>/jobs/<slug>
//          (the public HTML page is bot-blocked; the org-scoped JSON endpoint is not.)
//
// Adapted for the French market from the UK fork's wttj-search
// (github.com/anjolok1997/ai-job-search-uk, MIT).

export const API = "https://api.welcometothejungle.com/api/v3"
export const SEARCH_URL = `${API}/public/jobs`
export const SITE = "https://www.welcometothejungle.com/fr/companies"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

// Honest UA naming the tool, the convention every portal CLI in this repo follows.
const UA = "Mozilla/5.0 (compatible; wttj-cli/1.0)"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<any | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string // "<orgSlug>/<jobSlug>" — the reference the detail command consumes
  title: string
  company: string | null
  location: string | null
  salary: string | null
  date: string | null
  remote: string | null
  contractType: string | null
  experienceMin: number | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  /** "Profil recherché": experience, skills and qualities the employer asks for. */
  profile: string | null
  keyMissions: string[]
  recruitmentProcess: string | null
  skills: string[]
  tools: string[]
  language: string | null
  startDate: string | null
  educationLevel: string | null
  applyUrl: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** Turn the HTML description WTTJ returns into readable plain text. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(
    withBreaks.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Lower-case and strip accents, so "Évry" matches "evry". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

/** A raw WTTJ office block, from `office` or an entry of `offices`. */
interface Office {
  city?: string
  country_code?: string
  latitude?: number
  longitude?: number
}

function offices(raw: any): Office[] {
  const list: Office[] = []
  if (raw?.office) list.push(raw.office)
  if (Array.isArray(raw?.offices)) list.push(...raw.offices)
  return list
}

/** Centres used by --location + --radius. Coordinates are city centres (WGS84). */
export const PLACE_COORDS: Record<string, [number, number]> = {
  paris: [48.8566, 2.3522],
  "la defense": [48.8918, 2.2362],
  montrouge: [48.8163, 2.3163],
  "boulogne-billancourt": [48.8397, 2.2399],
  lyon: [45.764, 4.8357],
  marseille: [43.2965, 5.3698],
  toulouse: [43.6047, 1.4442],
  nice: [43.7102, 7.262],
  nantes: [47.2184, -1.5536],
  strasbourg: [48.5734, 7.7521],
  montpellier: [43.6108, 3.8767],
  bordeaux: [44.8378, -0.5792],
  lille: [50.6292, 3.0573],
  rennes: [48.1173, -1.6778],
  grenoble: [45.1885, 5.7245],
  aix: [43.5297, 5.4474],
  "aix-en-provence": [43.5297, 5.4474],
}

/** Region names that are really "Paris plus a radius". */
export const REGION_RADIUS: Record<string, { center: string; km: number }> = {
  "ile-de-france": { center: "paris", km: 45 },
  idf: { center: "paris", km: 45 },
  "region parisienne": { center: "paris", km: 45 },
  "grand paris": { center: "paris", km: 20 },
}

export function placeKey(s: string): string {
  return fold(s).replace(/\s+/g, " ")
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** True when any office in `country` lies within `km` of `center`. */
export function nearPoint(raw: any, center: [number, number], km: number, country: string): boolean {
  const c = country.toUpperCase()
  return offices(raw).some(
    (o) =>
      (o?.country_code || "").toUpperCase() === c &&
      typeof o?.latitude === "number" &&
      typeof o?.longitude === "number" &&
      haversineKm(center, [o.latitude, o.longitude]) <= km,
  )
}

/** True when any of the job's offices is in `country` (ISO 3166-1 alpha-2, e.g. "FR"). */
export function inCountry(raw: any, country: string): boolean {
  const want = country.toUpperCase()
  return offices(raw).some((o) => (o?.country_code || "").toUpperCase() === want)
}

/** True when any office in `country` has a city matching `city` (accent/case-insensitive substring). */
export function inCity(raw: any, city: string, country: string): boolean {
  const want = fold(city)
  const c = country.toUpperCase()
  return offices(raw).some(
    (o) => (o?.country_code || "").toUpperCase() === c && fold(o?.city || "").includes(want),
  )
}

function formatLocation(raw: any, country: string): string | null {
  const all = offices(raw)
  const hit = all.find((o) => (o?.country_code || "").toUpperCase() === country.toUpperCase()) || all[0]
  if (!hit) return raw?.remote === "fulltime" ? "Télétravail" : null
  const parts = [hit.city, hit.country_code].filter(Boolean)
  return parts.join(", ") || null
}

function formatSalary(raw: any): string | null {
  const min = raw?.salary_min
  const max = raw?.salary_max
  if (min == null && max == null) return null
  const cur = raw?.salary_currency || ""
  const per = raw?.salary_period
    ? `/${String(raw.salary_period).replace("yearly", "an").replace("monthly", "mois").replace("daily", "jour")}`
    : ""
  // U+202F/U+00A0 thousands separators from fr-FR become plain spaces for terminal tables.
  const money = (n: number) => `${n.toLocaleString("fr-FR").replace(/[  ]/g, " ")} ${cur}`.trim()
  if (min != null && max != null && min !== max) return `${money(min)} – ${money(max)}${per}`
  return `${money(min ?? max)}${per}`
}

/** Map a raw search/detail job object to a JobCard. */
export function mapCard(raw: any, country = "FR"): JobCard {
  const orgSlug = raw?.organization?.slug || ""
  const jobSlug = raw?.slug || ""
  return {
    id: orgSlug && jobSlug ? `${orgSlug}/${jobSlug}` : jobSlug,
    title: raw?.name ? decodeHtmlEntities(String(raw.name)).trim() : "(sans titre)",
    company: raw?.organization?.name ? String(raw.organization.name).trim() : null,
    location: formatLocation(raw, country),
    salary: formatSalary(raw),
    date: raw?.published_at || null,
    remote: raw?.remote || null,
    contractType: raw?.contract_type || null,
    experienceMin: typeof raw?.experience_min === "number" ? raw.experience_min : null,
    url: orgSlug && jobSlug ? `${SITE}/${orgSlug}/jobs/${jobSlug}` : SITE,
  }
}

/**
 * French contract words mapped to WTTJ's `contract_type` values, so `--contract cdi`
 * works as well as `--contract full_time`.
 */
export const CONTRACT_ALIASES: Record<string, string> = {
  cdi: "full_time",
  full_time: "full_time",
  cdd: "temporary",
  temporary: "temporary",
  stage: "internship",
  internship: "internship",
  alternance: "apprenticeship",
  apprentissage: "apprenticeship",
  apprenticeship: "apprenticeship",
  freelance: "freelance",
  independant: "freelance",
  vie: "vie",
  part_time: "part_time",
  temps_partiel: "part_time",
}

export function normalizeContract(input: string): string | null {
  return CONTRACT_ALIASES[fold(input).replace(/[\s-]+/g, "_")] ?? null
}

// Unicode-aware word edges: JS's \b treats "é" as a non-word char, so "diplômé" would never end a match.
const JUNIOR_RE =
  /(?<![\p{L}\p{N}])(junior|jeune\s*dipl[oô]m[ée]e?s?|d[ée]butant(e|s|es)?|graduate|entry[-\s]?level|stagiaire|stage|intern(ship)?|alternan(ce|t|te)|apprenti(e|ssage)?|apprentice(ship)?|trainee|v\.?i\.?e\.?)(?![\p{L}\p{N}])/iu

/**
 * Early-career heuristic for the --junior filter. A job qualifies when its title reads
 * as junior / jeune diplômé / stage / alternance, its contract is an internship or
 * apprenticeship, or it asks for at most ~1 year of experience.
 */
export function isJunior(card: JobCard): boolean {
  if (JUNIOR_RE.test(card.title)) return true
  const c = (card.contractType || "").toLowerCase()
  if (c === "internship" || c === "apprenticeship" || c === "vie") return true
  return card.experienceMin != null && card.experienceMin <= 1
}

/** Parse "<org>/<slug>", an API URL, or a public WTTJ URL into {org, slug}. */
export function parseDetailRef(input: string): { org: string; slug: string } | null {
  const s = input.trim()
  const url =
    s.match(/organizations\/([^/]+)\/jobs\/([^/?#]+)/i) ||
    s.match(/companies\/([^/]+)\/jobs\/([^/?#]+)/i)
  if (url) return { org: url[1], slug: url[2] }
  const bare = s.match(/^([^/\s]+)\/([^/\s?#]+)$/)
  if (bare) return { org: bare[1], slug: bare[2] }
  return null
}

function localized(v: any): string | null {
  if (typeof v === "string") return v.trim() || null
  if (v && typeof v === "object") {
    const n = v.name ?? v
    if (typeof n === "string") return n.trim() || null
    if (n && typeof n === "object") return (n.fr || n.en || Object.values(n).find((x) => typeof x === "string") || null) as string | null
  }
  return null
}

function htmlOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? htmlToText(v) || null : null
}

/** Map a raw detail `job` object to a JobDetail. */
export function parseJobDetail(raw: any, country = "FR"): JobDetail {
  const card = mapCard(raw, country)
  const list = (v: any) => (Array.isArray(v) ? v.map(localized).filter((x): x is string => !!x) : [])
  return {
    ...card,
    description: htmlOrNull(raw?.description),
    profile: htmlOrNull(raw?.looking_for_candidate_description),
    keyMissions: list(raw?.key_missions),
    recruitmentProcess: htmlOrNull(raw?.recruitment_process),
    skills: list(raw?.skills),
    tools: list(raw?.tools),
    language: typeof raw?.language === "string" ? raw.language : null,
    startDate: typeof raw?.start_date === "string" ? raw.start_date : null,
    educationLevel: raw?.education_level || null,
    applyUrl: raw?.apply_url || card.url,
  }
}
