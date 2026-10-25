import { API, CliError, apiGet, getToken, parseDetail, parseOfferId, readCredentials } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = parseOfferId(opts.id)
  if (!id) throw new CliError(`Could not read an offer id from "${opts.id}" (use the id from a search result)`, "BAD_ID")

  const token = await getToken(readCredentials())
  const res = await apiGet(`${API}/${encodeURIComponent(id)}`, token)
  if (!res.body) throw new CliError(`Offer ${id} not found (it may have been filled or withdrawn)`, "NOT_FOUND")

  const job = parseDetail(res.body)
  if (opts.format === "plain") {
    const list = (label: string, xs: string[]) => (xs.length ? `${label} :\n${xs.map((x) => `  - ${x}`).join("\n")}` : "")
    const lines = [
      job.title,
      `${job.company || "—"} · ${job.location || "—"}`,
      "",
      job.contract ? `Contrat : ${job.contract}` : "",
      job.workingHours ? `Durée : ${job.workingHours}` : "",
      job.salary ? `Salaire : ${job.salary}` : "",
      job.experience ? `Expérience : ${job.experience}` : "",
      job.rome ? `Métier (ROME) : ${job.rome}` : "",
      job.sector ? `Secteur : ${job.sector}` : "",
      job.date ? `Publiée le : ${job.date}` : "",
      "",
      job.description || "(pas de description)",
      "",
      list("Compétences", job.skills),
      list("Formation", job.education),
      list("Langues", job.languages),
      "",
      `URL : ${job.url}`,
      job.applyUrl && job.applyUrl !== job.url ? `Postuler : ${job.applyUrl}` : "",
    ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0))
    process.stdout.write(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n")
  } else {
    process.stdout.write(JSON.stringify(job, null, 2) + "\n")
  }
  return 0
}
