// Data source: France Travail "Offres d'emploi v2" — the official public-employment-service API.
// Free credentials: create an app on https://francetravail.io and subscribe it to "Offres d'emploi v2".
//
// Token:  POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire
//         form: grant_type=client_credentials, client_id, client_secret, scope="api_offresdemploiv2 o2dsoffre"
// Search: GET  https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?motsCles=…&range=0-49
//         200 = complete, 206 = partial (more pages), 204 = no results. Total in `Content-Range: offres 0-49/1234`.
// Detail: GET  https://api.francetravail.io/partenaire/offresdemploi/v2/offres/<id>
// Public: https://candidat.francetravail.fr/offres/recherche/detail/<id>

export const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"
export const SCOPE = "api_offresdemploiv2 o2dsoffre"
export const API = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres"
export const PUBLIC_URL = "https://candidat.francetravail.fr/offres/recherche/detail"

export const ENV_ID = "FRANCE_TRAVAIL_CLIENT_ID"
export const ENV_SECRET = "FRANCE_TRAVAIL_CLIENT_SECRET"

const UA = "Mozilla/5.0 (compatible; francetravail-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

export class CliError extends Error {
  constructor(message: string, public code: string) {
    super(message)
  }
}

/** Read credentials from the environment only — never from flags or files. */
export function readCredentials(env: Record<string, string | undefined> = process.env): {
  id: string
  secret: string
} {
  const id = env[ENV_ID]?.trim()
  const secret = env[ENV_SECRET]?.trim()
  if (!id || !secret) {
    throw new CliError(
      `Missing France Travail credentials: export ${ENV_ID} and ${ENV_SECRET} (free app on https://francetravail.io subscribed to "Offres d'emploi v2").`,
      "MISSING_CREDENTIALS",
    )
  }
  return { id, secret }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

/** Fetch with exponential backoff and jitter on 429/5xx. */
async function fetchWithBackoff(url: string, init: RequestInit): Promise<Response> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      await sleep(delay + Math.floor(Math.random() * 500))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    return res
  }
}

/** Exchange the client credentials for a short-lived bearer token (kept in memory only). */
export async function getToken(creds: { id: string; secret: string }): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.id,
    client_secret: creds.secret,
    scope: SCOPE,
  })
  const res = await fetchWithBackoff(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "application/json" },
    body,
  })
  if (!res.ok) {
    throw new CliError(
      `France Travail authentication failed (${res.status}). Check ${ENV_ID}/${ENV_SECRET} and that the app is subscribed to "Offres d'emploi v2".`,
      "AUTH_FAILED",
    )
  }
  const json: any = await res.json()
  if (!json?.access_token) throw new CliError("Token response had no access_token", "AUTH_FAILED")
  return String(json.access_token)
}

export interface ApiResponse {
  status: number
  body: any | null
  contentRange: string | null
}

/** Authenticated GET. 204 and 404 return body=null rather than throwing. */
export async function apiGet(url: string, token: string): Promise<ApiResponse> {
  const res = await fetchWithBackoff(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": UA },
  })
  if (res.status === 204 || res.status === 404) {
    return { status: res.status, body: null, contentRange: res.headers.get("content-range") }
  }
  if (res.status === 400) {
    let msg = ""
    try {
      msg = ((await res.json()) as any)?.message ?? ""
    } catch {}
    throw new CliError(`France Travail rejected the query: ${msg || "bad request"}`, "BAD_QUERY")
  }
  if (res.status === 401 || res.status === 403) {
    throw new CliError(`France Travail refused access (${res.status}); check the app's API subscription.`, "AUTH_FAILED")
  }
  if (!res.ok) throw new CliError(`Request failed: ${res.status} ${res.statusText}`, "HTTP_ERROR")
  return { status: res.status, body: await res.json(), contentRange: res.headers.get("content-range") }
}

/** "offres 0-49/1234" → 1234. */
export function parseTotal(contentRange: string | null): number | null {
  const m = contentRange?.match(/\/(\d+)\s*$/)
  return m ? parseInt(m[1], 10) : null
}

// ---------------------------------------------------------------------------
// Query building

/** The API caps the window: first index ≤ 1000, last index ≤ 1149, at most 150 per call. */
export const MAX_PER_PAGE = 150
export const MAX_FIRST = 1000
export const MAX_LAST = 1149

export function buildRange(page: number, perPage: number): string {
  const first = (page - 1) * perPage
  if (first > MAX_FIRST) {
    throw new CliError(
      `France Travail only serves the first ${MAX_LAST + 1} results of a query; page ${page} at ${perPage}/page starts at ${first}. Narrow the query instead.`,
      "BAD_ARG",
    )
  }
  const last = Math.min(first + perPage - 1, MAX_LAST)
  return `${first}-${last}`
}

/** `publieeDepuis` only accepts these day counts; round up, then filter exactly client-side. */
export const PUBLIEE_DEPUIS = [1, 3, 7, 14, 31]

export function publieeDepuisFor(days: number): number | null {
  return PUBLIEE_DEPUIS.find((d) => d >= days) ?? null
}

/** Friendly contract words → France Travail `typeContrat` codes. */
export const CONTRACT_CODES: Record<string, string> = {
  cdi: "CDI",
  cdd: "CDD",
  interim: "MIS",
  mis: "MIS",
  saisonnier: "SAI",
  sai: "SAI",
  freelance: "LIB",
  liberal: "LIB",
  independant: "LIB",
  lib: "LIB",
  franchise: "FRA",
  fra: "FRA",
}

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

/** "cdi,cdd" → "CDI,CDD"; null when any part is unknown. */
export function contractCodes(input: string): string | null {
  const parts = input.split(",").map((p) => fold(p)).filter(Boolean)
  if (parts.length === 0) return null
  const codes = parts.map((p) => CONTRACT_CODES[p])
  return codes.every(Boolean) ? [...new Set(codes)].join(",") : null
}

/**
 * A few common place names mapped to the codes the API wants. `commune` takes an INSEE code
 * (not a postal code); Paris is searched by département since its INSEE codes are per arrondissement.
 */
export const PLACES: Record<string, { departement?: string; commune?: string }> = {
  paris: { departement: "75" },
  "ile-de-france": { departement: "75,92,93,94,78" },
  idf: { departement: "75,92,93,94,78" },
  "petite couronne": { departement: "92,93,94" },
  "hauts-de-seine": { departement: "92" },
  "seine-saint-denis": { departement: "93" },
  "val-de-marne": { departement: "94" },
  yvelines: { departement: "78" },
  essonne: { departement: "91" },
  "val-d'oise": { departement: "95" },
  "seine-et-marne": { departement: "77" },
  lyon: { commune: "69123" },
  marseille: { commune: "13055" },
  toulouse: { commune: "31555" },
  nice: { commune: "06088" },
  nantes: { commune: "44109" },
  strasbourg: { commune: "67482" },
  montpellier: { commune: "34172" },
  bordeaux: { commune: "33063" },
  lille: { commune: "59350" },
  rennes: { commune: "35238" },
}

/**
 * Resolve --location into API params:
 *  - "75", "2A", "971" or "75,92" → departement (up to 5, comma-separated)
 *  - a 5-character INSEE code like "92049" → commune
 *  - a known place name (see PLACES) → its mapping
 */
export function resolveLocation(input: string): { departement?: string; commune?: string } | null {
  const s = input.trim()
  const dept = /^(\d{2}|2[AB]|97\d)$/i
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0 && parts.length <= 5 && parts.every((p) => dept.test(p))) {
    return { departement: parts.map((p) => p.toUpperCase()).join(",") }
  }
  if (/^(\d{5}|2[AB]\d{3})$/i.test(s)) return { commune: s.toUpperCase() }
  const key = fold(s).replace(/\s+/g, " ")
  return PLACES[key] ?? PLACES[key.replace(/ /g, "-")] ?? null
}

// ---------------------------------------------------------------------------
// Response mapping

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  contract: string | null
  salary: string | null
  experience: string | null
  workingHours: string | null
  rome: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  skills: string[]
  education: string[]
  languages: string[]
  sector: string | null
  companyDescription: string | null
  applyUrl: string | null
  originUrl: string | null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export function publicUrl(id: string): string {
  return `${PUBLIC_URL}/${encodeURIComponent(id)}`
}

/** Map one `resultats[]` / detail object to a JobCard. */
export function mapCard(raw: any): JobCard {
  const id = str(raw?.id) ?? ""
  return {
    id,
    title: str(raw?.intitule) ?? "(sans titre)",
    company: str(raw?.entreprise?.nom),
    location: str(raw?.lieuTravail?.libelle),
    date: str(raw?.dateCreation),
    url: id ? publicUrl(id) : PUBLIC_URL,
    contract: str(raw?.typeContratLibelle) ?? str(raw?.typeContrat),
    salary: str(raw?.salaire?.libelle) ?? str(raw?.salaire?.commentaire),
    experience: str(raw?.experienceLibelle),
    workingHours: str(raw?.dureeTravailLibelleConverti) ?? str(raw?.dureeTravailLibelle),
    rome: str(raw?.romeLibelle) ?? str(raw?.appellationlibelle),
  }
}

/** France Travail descriptions are plain text with \n; normalise whitespace only. */
export function cleanText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function parseDetail(raw: any): JobDetail {
  const card = mapCard(raw)
  const labels = (arr: any, f: (x: any) => string | null) =>
    Array.isArray(arr) ? arr.map(f).filter((x): x is string => !!x) : []
  const req = (x: any) => (x?.exigence === "E" ? " (exigé)" : x?.exigence === "S" ? " (souhaité)" : "")
  return {
    ...card,
    description: str(raw?.description) ? cleanText(String(raw.description)) : null,
    skills: labels(raw?.competences, (c) => (str(c?.libelle) ? `${c.libelle.trim()}${req(c)}` : null)),
    education: labels(raw?.formations, (f) => {
      const t = [str(f?.niveauLibelle), str(f?.domaineLibelle)].filter(Boolean).join(" — ")
      return t ? `${t}${req(f)}` : null
    }),
    languages: labels(raw?.langues, (l) => (str(l?.libelle) ? `${l.libelle.trim()}${req(l)}` : null)),
    sector: str(raw?.secteurActiviteLibelle),
    companyDescription: str(raw?.entreprise?.description),
    applyUrl: str(raw?.contact?.urlPostulation) ?? str(raw?.origineOffre?.urlOrigine) ?? card.url,
    originUrl: str(raw?.origineOffre?.urlOrigine),
  }
}

/** Accept a bare offer id ("201ABCD") or a candidat.francetravail.fr detail URL. */
export function parseOfferId(input: string): string | null {
  const s = input.trim()
  const url = s.match(/\/offres\/recherche\/detail\/([A-Za-z0-9]+)/) || s.match(/\/offresdemploi\/v2\/offres\/([A-Za-z0-9]+)/)
  if (url) return url[1]
  return /^[A-Za-z0-9]{5,12}$/.test(s) ? s : null
}
