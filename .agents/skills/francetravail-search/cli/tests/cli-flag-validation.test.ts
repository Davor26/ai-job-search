import { test, expect, describe } from "bun:test"
import { runCLI } from "./helpers.js"

// These run without network access: every case fails before any request is sent.
describe("cli flag validation", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("francetravail-cli")
  })

  test("--help exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("USAGE")
  })

  test("unknown command errors on stderr", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD")
  })

  for (const [name, args] of [
    ["negative --limit", ["search", "-q", "x", "--limit", "-5"]],
    ["fractional --jobage", ["search", "-q", "x", "--jobage", "2.5"]],
    ["--per-page over 150", ["search", "-q", "x", "--per-page", "200"]],
    ["unknown --location", ["search", "-q", "x", "-l", "Atlantis"]],
    ["--distance without a commune", ["search", "-q", "x", "-l", "75", "--distance", "10"]],
    ["unknown --contract", ["search", "-q", "x", "--contract", "forever"]],
    ["bad --experience", ["search", "-q", "x", "--experience", "9"]],
    ["bad --sort", ["search", "-q", "x", "--sort", "random"]],
  ] as const) {
    test(`${name} is rejected with BAD_ARG`, async () => {
      const r = await runCLI([...args])
      expect(r.exitCode).toBe(1)
      expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
    })
  }

  test("detail without an id errors", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })

  test("missing credentials fail loudly before any request", async () => {
    const r = await runCLI(["search", "-q", "x"], { FRANCE_TRAVAIL_CLIENT_ID: "", FRANCE_TRAVAIL_CLIENT_SECRET: "" })
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("MISSING_CREDENTIALS")
    expect(err.error).toContain("FRANCE_TRAVAIL_CLIENT_ID")
    expect(r.stdout).toBe("")
  })
})
