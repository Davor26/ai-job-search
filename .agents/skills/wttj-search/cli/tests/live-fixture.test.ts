import { test, expect, describe } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  PLACE_COORDS,
  inCity,
  inCountry,
  mapCard,
  nearPoint,
  parseJobDetail,
} from "../src/helpers.js"

// A real API response (see the fixture's _note), so these tests check the parser against
// the shape WTTJ actually returns rather than an assumed one.
const fx = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/live-2026-10-25.json"), "utf8"))
const data: any[] = fx.search.data

describe("live search payload", () => {
  const cards = data.map((r) => mapCard(r))

  test("every card has id, title, company, url", () => {
    for (const c of cards) {
      expect(c.id).toMatch(/^[^/]+\/[^/]+$/)
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.company).not.toBeNull()
      expect(c.url).toStartWith("https://www.welcometothejungle.com/fr/companies/")
    }
  })

  test("the country filter drops the Madrid offices", () => {
    expect(data.filter((r) => inCountry(r, "FR")).length).toBe(8)
  })

  test("a fractional experience_min survives", () => {
    expect(cards.find((c) => c.id.endsWith("_marseille"))?.experienceMin).toBe(0.5)
  })

  test("an open-ended salary range shows only the minimum", () => {
    expect(cards.find((c) => c.company === "On train")?.salary).toBe("45 000 EUR/an")
  })

  test("a name match on Paris misses the inner suburbs", () => {
    expect(data.filter((r) => inCity(r, "Paris", "FR")).length).toBe(1)
  })

  test("a 15 km radius around Paris catches Aubervilliers and Clichy, not Lyon", () => {
    const hits = data.filter((r) => nearPoint(r, PLACE_COORDS.paris, 15, "FR")).map((r) => r.office.city)
    expect(hits.sort()).toEqual(["Aubervilliers", "Clichy", "Paris"])
  })

  test("a 20 km radius around Lyon catches Saint-Priest", () => {
    const hits = data.filter((r) => nearPoint(r, PLACE_COORDS.lyon, 20, "FR")).map((r) => r.office.city)
    expect(hits.sort()).toEqual(["Lyon", "Saint-Priest"])
  })
})

describe("live detail payload", () => {
  const job = parseJobDetail(fx.detail.job)

  test("reads the candidate profile separately from the description", () => {
    expect(job.profile).toContain("3 à 7 ans")
    expect(job.description).not.toContain("3 à 7 ans")
  })

  test("decodes entities and strips tags", () => {
    expect(job.description).toContain("P&L")
    expect(job.description).not.toContain("<")
  })

  test("localises skills to French", () => {
    expect(job.skills).toEqual(["Développement commercial"])
  })

  test("keeps the recruitment process and the ATS apply link", () => {
    expect(job.recruitmentProcess).toContain("Entretien manager")
    expect(job.applyUrl).toStartWith("https://ats.welcometothejungle.com/")
    expect(job.language).toBe("fr")
  })
})
