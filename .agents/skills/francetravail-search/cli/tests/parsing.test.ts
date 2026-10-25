import { test, expect, describe } from "bun:test"
import {
  buildRange,
  contractCodes,
  mapCard,
  parseDetail,
  parseOfferId,
  parseTotal,
  publieeDepuisFor,
  readCredentials,
  resolveLocation,
} from "../src/helpers.js"
import { buildSearchParams, type SearchOpts } from "../src/commands/search.js"

// Shape follows the "Offres d'emploi v2" response model.
const RAW = {
  id: "201ABCD",
  intitule: "Business developer B2B (H/F)",
  description: "Vous prospectez des PME.\r\n\r\n\r\nVous négociez.  ",
  dateCreation: "2026-10-22T09:15:00.000Z",
  lieuTravail: { libelle: "92 - MONTROUGE", codePostal: "92120", commune: "92049" },
  romeLibelle: "Technico-commercial / Technico-commerciale",
  entreprise: { nom: "ACME CONSEIL", description: "Cabinet de conseil." },
  typeContrat: "CDI",
  typeContratLibelle: "Contrat à durée indéterminée",
  experienceLibelle: "2 An(s)",
  salaire: { libelle: "Annuel de 40000.0 Euros à 50000.0 Euros sur 12.0 mois" },
  dureeTravailLibelleConverti: "Temps plein",
  competences: [
    { libelle: "Prospecter un secteur", exigence: "E" },
    { libelle: "Négocier un contrat", exigence: "S" },
  ],
  formations: [{ niveauLibelle: "Bac+3, Bac+4 ou équivalents", domaineLibelle: "Commerce", exigence: "S" }],
  langues: [{ libelle: "Anglais", exigence: "E" }],
  secteurActiviteLibelle: "Conseil pour les affaires",
  contact: { urlPostulation: "https://acme.example/postuler" },
  origineOffre: { origine: "1", urlOrigine: "https://candidat.francetravail.fr/offres/recherche/detail/201ABCD" },
}

describe("mapCard", () => {
  const c = mapCard(RAW)
  test("maps the core contract fields", () => {
    expect(c.id).toBe("201ABCD")
    expect(c.title).toBe("Business developer B2B (H/F)")
    expect(c.company).toBe("ACME CONSEIL")
    expect(c.location).toBe("92 - MONTROUGE")
    expect(c.date).toBe("2026-10-22T09:15:00.000Z")
    expect(c.url).toBe("https://candidat.francetravail.fr/offres/recherche/detail/201ABCD")
  })
  test("prefers human labels", () => {
    expect(c.contract).toBe("Contrat à durée indéterminée")
    expect(c.workingHours).toBe("Temps plein")
  })
  test("missing values are null, not omitted", () => {
    const empty = mapCard({ id: "X1" })
    expect(empty.company).toBeNull()
    expect(empty.location).toBeNull()
    expect(empty.date).toBeNull()
    expect("salary" in empty).toBe(true)
  })
})

describe("parseDetail", () => {
  const d = parseDetail(RAW)
  test("cleans the description", () => {
    expect(d.description).toBe("Vous prospectez des PME.\n\nVous négociez.")
  })
  test("labels required vs desired skills", () => {
    expect(d.skills).toEqual(["Prospecter un secteur (exigé)", "Négocier un contrat (souhaité)"])
    expect(d.languages).toEqual(["Anglais (exigé)"])
    expect(d.education[0]).toContain("Commerce")
  })
  test("prefers the employer's application link", () => {
    expect(d.applyUrl).toBe("https://acme.example/postuler")
  })
})

describe("query building", () => {
  const base: SearchOpts = { sort: "date", page: 1, perPage: 50, format: "json" }

  test("maps flags to API parameters", () => {
    const p = buildSearchParams({ ...base, query: "commercial", departement: "75", contract: "CDI", jobage: 10 })
    expect(p.get("motsCles")).toBe("commercial")
    expect(p.get("departement")).toBe("75")
    expect(p.get("typeContrat")).toBe("CDI")
    expect(p.get("publieeDepuis")).toBe("14")
    expect(p.get("sort")).toBe("1")
    expect(p.get("range")).toBe("0-49")
  })
  test("distance is only sent with a commune", () => {
    expect(buildSearchParams({ ...base, departement: "75", distance: 10 }).get("distance")).toBeNull()
    expect(buildSearchParams({ ...base, commune: "69123", distance: 10 }).get("distance")).toBe("10")
  })
  test("alternance uses contract nature codes", () => {
    expect(buildSearchParams({ ...base, alternance: true }).get("natureContrat")).toBe("E2,FS")
  })
  test("relevance sort", () => {
    expect(buildSearchParams({ ...base, sort: "relevance" }).get("sort")).toBe("0")
  })
})

describe("buildRange", () => {
  test("pages are 1-indexed", () => {
    expect(buildRange(1, 50)).toBe("0-49")
    expect(buildRange(3, 50)).toBe("100-149")
  })
  test("the last allowed window starts at index 1000", () => {
    expect(buildRange(21, 50)).toBe("1000-1049")
  })
  test("refuses windows starting beyond index 1000", () => {
    expect(() => buildRange(8, 150)).toThrow()
    expect(() => buildRange(22, 50)).toThrow()
  })
})

describe("publieeDepuisFor", () => {
  test("rounds up to an accepted value", () => {
    expect(publieeDepuisFor(1)).toBe(1)
    expect(publieeDepuisFor(2)).toBe(3)
    expect(publieeDepuisFor(30)).toBe(31)
    expect(publieeDepuisFor(60)).toBeNull()
  })
})

describe("contractCodes", () => {
  test("maps French words, including lists", () => {
    expect(contractCodes("cdi")).toBe("CDI")
    expect(contractCodes("CDI, cdd")).toBe("CDI,CDD")
    expect(contractCodes("intérim")).toBe("MIS")
  })
  test("unknown types return null", () => {
    expect(contractCodes("permanent")).toBeNull()
  })
})

describe("resolveLocation", () => {
  test("département codes", () => {
    expect(resolveLocation("75")).toEqual({ departement: "75" })
    expect(resolveLocation("92, 93")).toEqual({ departement: "92,93" })
    expect(resolveLocation("2a")).toEqual({ departement: "2A" })
  })
  test("INSEE commune codes", () => {
    expect(resolveLocation("92049")).toEqual({ commune: "92049" })
  })
  test("known names, accent-insensitive", () => {
    expect(resolveLocation("Paris")).toEqual({ departement: "75" })
    expect(resolveLocation("Île-de-France")?.departement).toContain("92")
    expect(resolveLocation("lyon")).toEqual({ commune: "69123" })
  })
  test("unknown names return null", () => {
    expect(resolveLocation("Atlantis")).toBeNull()
  })
})

describe("misc", () => {
  test("parseTotal reads Content-Range", () => {
    expect(parseTotal("offres 0-49/1234")).toBe(1234)
    expect(parseTotal(null)).toBeNull()
  })
  test("parseOfferId accepts ids and URLs", () => {
    expect(parseOfferId("201ABCD")).toBe("201ABCD")
    expect(parseOfferId("https://candidat.francetravail.fr/offres/recherche/detail/201ABCD?x=1")).toBe("201ABCD")
    expect(parseOfferId("not an id")).toBeNull()
  })
  test("readCredentials fails loudly when unset", () => {
    expect(() => readCredentials({})).toThrow(/FRANCE_TRAVAIL_CLIENT_ID/)
    expect(readCredentials({ FRANCE_TRAVAIL_CLIENT_ID: "a", FRANCE_TRAVAIL_CLIENT_SECRET: "b" })).toEqual({
      id: "a",
      secret: "b",
    })
  })
})
