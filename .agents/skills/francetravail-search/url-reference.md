# France Travail "Offres d'emploi v2" — API reference

Official API of the French public employment service. Free credentials from
[francetravail.io](https://francetravail.io) (declare an app, subscribe it to "Offres d'emploi v2").

## Token

```
POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=…&client_secret=…&scope=api_offresdemploiv2 o2dsoffre
```

Returns `{ access_token, expires_in, … }`. The CLI keeps the token in memory for the single
command it runs; nothing is written to disk. Credentials come from `FRANCE_TRAVAIL_CLIENT_ID`
and `FRANCE_TRAVAIL_CLIENT_SECRET`.

## Search

```
GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search
Authorization: Bearer <token>
```

| Param | CLI flag | Notes |
|-------|----------|-------|
| `motsCles` | `--query` | Free-text keywords |
| `departement` | `--location 75` / `92,93` | Up to 5 codes, comma-separated |
| `commune` | `--location 92049` / city name | **INSEE** code, not postal code |
| `distance` | `--distance` | km around `commune` |
| `typeContrat` | `--contract` | `CDI`, `CDD`, `MIS` (intérim), `SAI` (saisonnier), `LIB` (libéral/freelance), `FRA` (franchise) |
| `natureContrat` | `--alternance` | `E2` apprentissage, `FS` contrat de professionnalisation |
| `experience` | `--experience` | `1` < 1 an, `2` 1-3 ans, `3` > 3 ans |
| `tempsPlein` | `--full-time` | `true` |
| `publieeDepuis` | `--jobage` | Only `1`, `3`, `7`, `14`, `31` |
| `sort` | `--sort` | `0` relevance, `1` newest first, `2` distance |
| `range` | `--page`/`--per-page` | `first-last`, ≤150 per call, first ≤ 1000, last ≤ 1149 |

Other parameters the API accepts but the CLI does not expose yet: `codeROME`, `appellation`,
`region`, `codeNAF`, `secteurActivite`, `qualification`, `niveauFormation`, `salaireMin` +
`periodeSalaire`, `dureeHebdo`, `minCreationDate`/`maxCreationDate`, `origineOffre`,
`accesTravailleurHandicape`.

Status codes: `200` complete, `206` partial (more results), `204` no results, `400` bad
query (`{ message }`), `401/403` auth, `429` rate limit. Total matches are in the
`Content-Range` header: `offres 0-49/1234`.

Response: `{ resultats: [Offre], filtresPossibles: [...] }`.

## Detail

```
GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/<id>
```

Returns one `Offre`. `204` when the offer no longer exists.

## Offre fields used

| Field | Output |
|-------|--------|
| `id` | `id` |
| `intitule` | `title` |
| `entreprise.nom` / `entreprise.description` | `company` / `companyDescription` |
| `lieuTravail.libelle` | `location` (e.g. `92 - MONTROUGE`) |
| `dateCreation` | `date` |
| `typeContratLibelle` (fallback `typeContrat`) | `contract` |
| `salaire.libelle` (fallback `salaire.commentaire`) | `salary` |
| `experienceLibelle` | `experience` |
| `dureeTravailLibelleConverti` | `workingHours` |
| `romeLibelle` | `rome` |
| `description` (plain text) | `description` |
| `competences[].libelle` + `exigence` (`E` exigé / `S` souhaité) | `skills` |
| `formations[]`, `langues[]` | `education`, `languages` |
| `contact.urlPostulation`, `origineOffre.urlOrigine` | `applyUrl`, `originUrl` |

## Public offer URL

```
https://candidat.francetravail.fr/offres/recherche/detail/<id>
```

## Limits

About 10 calls per second for this API. The CLI retries `429`/`5xx` with exponential backoff
and jitter (max 6 retries).
