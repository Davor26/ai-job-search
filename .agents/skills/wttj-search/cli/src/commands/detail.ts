import { API, jsonFetch, parseDetailRef, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = parseDetailRef(opts.id)
  if (!ref) {
    writeError(
      `Could not parse "<org>/<slug>" from "${opts.id}" (use the id from a search result)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const url = `${API}/organizations/${encodeURIComponent(ref.org)}/jobs/${encodeURIComponent(ref.slug)}`
    const body = await jsonFetch(url)
    const raw = body?.job
    if (!raw) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(raw)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.contractType ? `Contrat : ${job.contractType}` : "",
        job.remote ? `Télétravail : ${job.remote}` : "",
        job.experienceMin != null ? `Expérience min. : ${job.experienceMin} an(s)` : "",
        job.educationLevel ? `Niveau d'études : ${job.educationLevel}` : "",
        job.salary ? `Salaire : ${job.salary}` : "",
        job.date ? `Publiée le : ${job.date}` : "",
        "",
        job.startDate ? `Début : ${job.startDate}` : "",
        job.skills.length ? `Compétences : ${job.skills.join(", ")}` : "",
        job.tools.length ? `Outils : ${job.tools.join(", ")}` : "",
        "",
        "DESCRIPTION",
        job.description || "(pas de description)",
        job.keyMissions.length ? `\nMISSIONS CLÉS\n${job.keyMissions.map((m) => `- ${m}`).join("\n")}` : "",
        job.profile ? `\nPROFIL RECHERCHÉ\n${job.profile}` : "",
        job.recruitmentProcess ? `\nPROCESSUS DE RECRUTEMENT\n${job.recruitmentProcess}` : "",
        "",
        `URL : ${job.url}`,
        job.applyUrl ? `Postuler : ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
