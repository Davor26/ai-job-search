import { test, expect, describe } from "bun:test"
import { runCLI } from "./helpers.js"

describe("cli flag validation", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("wttj-cli")
  })

  test("--help prints help and exits 0", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("USAGE")
  })

  test("unknown command errors on stderr with exit 1", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_CMD")
  })

  test("search with no query and no --junior errors", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("NO_QUERY")
  })

  test("detail without an id errors on stderr with exit 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("NO_ID")
  })

  test("detail with an unparseable id errors on stderr with exit 1", async () => {
    const r = await runCLI(["detail", "just-one-token"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_ID")
  })

  test("non-numeric --jobage errors on stderr with exit 1", async () => {
    const r = await runCLI(["search", "-q", "x", "--jobage", "soon"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_ARG")
  })

  // Regression (#281 bug class): a bare parseInt() accepted a negative --limit
  // (silently disabling the cap) and truncated a fractional to a whole number.
  test("negative --limit is rejected, not silently ignored", async () => {
    const r = await runCLI(["search", "-q", "x", "--limit", "-5"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("fractional --jobage is rejected, not truncated", async () => {
    const r = await runCLI(["search", "-q", "x", "--jobage", "2.5"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("unknown --contract is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--contract", "forever"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("bad --country is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--country", "France"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("bad --remote is rejected", async () => {
    const r = await runCLI(["search", "-q", "x", "--remote", "sometimes"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
})
