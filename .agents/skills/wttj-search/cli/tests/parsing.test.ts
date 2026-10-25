import { test, expect, describe } from "bun:test"
import {
  mapCard,
  inCountry,
  inCity,
  isJunior,
  normalizeContract,
  parseDetailRef,
  parseJobDetail,
  htmlToText,
} from "../src/helpers.js"

const RAW_JOB = {
  name: "Business Developer",
  slug: "business-developer_paris_ABC123",
  contract_type: "full_time",
  remote: "partial",
  published_at: "2026-10-20T08:00:00Z",
  experience_min: 3,
  salary_min: 45000,
  salary_max: 55000,
  salary_currency: "EUR",
  salary_period: "yearly",
  organization: { name: "Acme SAS", slug: "acme" },
  office: { city: "Paris", country_code: "FR" },
  offices: [{ city: "Paris", country_code: "FR" }],
}

describe("mapCard", () => {
  const c = mapCard(RAW_JOB)
  test("builds an org/slug id and a French public url", () => {
    expect(c.id).toBe("acme/business-developer_paris_ABC123")
    expect(c.url).toBe("https://www.welcometothejungle.com/fr/companies/acme/jobs/business-developer_paris_ABC123")
  })
  test("maps title, company, location, date", () => {
    expect(c.title).toBe("Business Developer")
    expect(c.company).toBe("Acme SAS")
    expect(c.location).toBe("Paris, FR")
    expect(c.date).toBe("2026-10-20T08:00:00Z")
  })
  test("formats a salary range the French way", () => {
    expect(c.salary).toBe("45 000 EUR – 55 000 EUR/an")
  })
})

describe("country and city filters", () => {
  test("inCountry matches FR offices and rejects others", () => {
    expect(inCountry(RAW_JOB, "FR")).toBe(true)
    expect(inCountry(RAW_JOB, "fr")).toBe(true)
    expect(inCountry({ office: { city: "London", country_code: "GB" } }, "FR")).toBe(false)
  })
  test("inCountry reads the offices array when office is absent", () => {
    expect(inCountry({ offices: [{ country_code: "GB" }, { country_code: "FR" }] }, "FR")).toBe(true)
  })
  test("inCity is accent- and case-insensitive", () => {
    const evry = { offices: [{ city: "Évry-Courcouronnes", country_code: "FR" }] }
    expect(inCity(evry, "evry", "FR")).toBe(true)
    expect(inCity(RAW_JOB, "PARIS", "FR")).toBe(true)
    expect(inCity(RAW_JOB, "Lyon", "FR")).toBe(false)
  })
  test("inCity ignores a same-named city in another country", () => {
    expect(inCity({ offices: [{ city: "Paris", country_code: "US" }] }, "Paris", "FR")).toBe(false)
  })
})

describe("normalizeContract", () => {
  test("maps French contract words to WTTJ values", () => {
    expect(normalizeContract("CDI")).toBe("full_time")
    expect(normalizeContract("stage")).toBe("internship")
    expect(normalizeContract("Alternance")).toBe("apprenticeship")
    expect(normalizeContract("temps partiel")).toBe("part_time")
    expect(normalizeContract("full_time")).toBe("full_time")
  })
  test("unknown values return null", () => {
    expect(normalizeContract("permanent-ish")).toBeNull()
  })
})

describe("isJunior", () => {
  test("French and English title keywords qualify", () => {
    expect(isJunior(mapCard({ ...RAW_JOB, name: "Chargé de recrutement junior" }))).toBe(true)
    expect(isJunior(mapCard({ ...RAW_JOB, name: "Stage - Business Developer" }))).toBe(true)
    expect(isJunior(mapCard({ ...RAW_JOB, name: "Alternance Commercial B2B" }))).toBe(true)
    expect(isJunior(mapCard({ ...RAW_JOB, name: "Jeune diplômé - Analyste" }))).toBe(true)
  })
  test("internship / apprenticeship contract qualifies", () => {
    expect(isJunior(mapCard({ ...RAW_JOB, contract_type: "internship" }))).toBe(true)
    expect(isJunior(mapCard({ ...RAW_JOB, contract_type: "apprenticeship" }))).toBe(true)
  })
  test("low required experience qualifies", () => {
    expect(isJunior(mapCard({ ...RAW_JOB, experience_min: 0 }))).toBe(true)
  })
  test("a senior role with 3+ years does not qualify", () => {
    expect(isJunior(mapCard(RAW_JOB))).toBe(false)
    expect(isJunior(mapCard({ ...RAW_JOB, name: "Head of Sales" }))).toBe(false)
  })
})

describe("parseDetailRef", () => {
  test("plain org/slug", () => {
    expect(parseDetailRef("acme/business-developer_paris_ABC123")).toEqual({
      org: "acme",
      slug: "business-developer_paris_ABC123",
    })
  })
  test("api url", () => {
    expect(parseDetailRef("https://api.welcometothejungle.com/api/v3/organizations/acme/jobs/x_y_Z")).toEqual({
      org: "acme",
      slug: "x_y_Z",
    })
  })
  test("French public site url", () => {
    expect(parseDetailRef("https://www.welcometothejungle.com/fr/companies/acme/jobs/some-slug?q=1")).toEqual({
      org: "acme",
      slug: "some-slug",
    })
  })
  test("unparseable returns null", () => {
    expect(parseDetailRef("just-one-token")).toBeNull()
  })
})

describe("parseJobDetail", () => {
  const job = parseJobDetail({
    ...RAW_JOB,
    description: "<p><strong>Missions</strong></p><ul><li>Prospecter</li><li>Négocier</li></ul>",
    education_level: "master",
    apply_url: "https://example.com/apply",
  })
  test("strips description html to readable text", () => {
    expect(job.description).toContain("Missions")
    expect(job.description).toContain("Négocier")
    expect(job.description).not.toContain("<li>")
  })
  test("maps education level and apply url", () => {
    expect(job.educationLevel).toBe("master")
    expect(job.applyUrl).toBe("https://example.com/apply")
  })
})

describe("htmlToText", () => {
  test("collapses whitespace and decodes entities", () => {
    expect(htmlToText("<p>a&amp;b</p><p>c&nbsp;d</p>")).toBe("a&b\nc d")
  })
})
