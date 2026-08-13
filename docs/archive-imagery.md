# Scoping: archive imagery for the house long-view

**Goal.** In the House Study, show each creative director's *vision* of the house not just as a
critic's paragraph (done) but with **imagery from their era** — the runway/collection looks that
defined their tenure. This is the "view the old creative directors and their vision, ideally by
images" ask.

**Why it's hard.** We currently ingest only the *current* season (Shopify `/products.json`). There
is no historical runway archive in the data, and the richest source — Vogue Runway (Condé Nast) —
is copyright-protected and hotlink-blocked; we won't scrape it (same rule as elsewhere in the app).
So this is fundamentally a **sourcing + licensing** problem, not a UI problem. The UI slot already
exists (the study's "Seasons in the archive" grid + the per-director rows).

---

## 1. Data model

A director era needs its own collections/looks. Two options:

- **`DirectorEra` / `Collection` model** (cleaner): `brand` FK, `director_name`, `season`, `year`,
  `title`, `looks` (JSON: `[{image_url, source, license, credit}]`), `note`. One row per notable
  collection.
- **Or extend `HouseLore.directors[]`** with a `looks: [{season, title, image, source, license}]`
  per director. Lighter, no new table, but couples imagery to the lore blob.

Recommendation: a small **`Collection`** table keyed to `(brand, director_name)` — it lets an image
resolver fill it incrementally and keeps licensing metadata per image.

## 2. Sourcing tiers (by legality → effort/cost)

| Tier | Source | Coverage | Cost / rights | Notes |
|---|---|---|---|---|
| 0 (done) | LLM critic text per director | all houses | free | the vision paragraph — already shipped |
| 1 | LLM lists signature collections (season/year/title/why) | all *known* houses | free (~1 call/house) | text + captions, placeholder tiles. Cheap next step. |
| 2a | **Museum open-access APIs** — The Met Costume Institute (CC0), V&A, Europeana | the canonical houses (Chanel, Dior, Schiaparelli, YSL…) | free, API, attribution | *archival garments* (object photography), not runway — but legitimately usable |
| 2b | **Wikimedia Commons** (PD / CC-BY) | iconic historic looks, some houses | free, attribution | search by house + designer + year; quality varies |
| 2c | House's own published archive / press site | a few houses | free-ish | many indie houses have no deep archive; scrape only what they publish |
| 3 | **Licensed runway archives** — Getty Images API, Launchmetrics/Spotlight, firstVIEW | near-complete, per-collection runway looks | paid (contract/API key) | the real answer for comprehensive per-collection imagery |

**Hard rule:** only store/display images with a known usable license (CC0 / CC-BY / PD, or a paid
license we hold). Always store `source` + `credit`. Never hotlink Condé Nast/Vogue or scrape
bot-blocked sources.

## 3. Ingestion mechanics (the resolver)

Per house, per director era:
1. **Propose** — LLM returns the director's signature collections: `{season, year, title, why}`
   (extends the existing `enrich_houses` pass; it already knows these for famous houses).
2. **Resolve an image** — a resolver queries the legal sources in Tier order for each collection:
   Met/Europeana/V&A API search by `house + designer + year` → Wikimedia → (later) a licensed API.
   Store the first hit with `image_url + source + license + credit`; else leave a placeholder.
3. **Render** — the study's per-director row gains a small strip of era looks (image + season +
   credit line); placeholder tile where no legal image resolved.

Idempotent, cached per (brand, collection), like the enrichment commands.

## 4. Recommended phasing

- **Phase 1 (cheap, ~1 day):** Tier 1 — extend `enrich_houses` to also return each director's
  signature collections (season/title/why). Ship as titled captions + placeholder tiles. Gives the
  structure and the "here's what each era looked like, in words" immediately.
- **Phase 2:** wire the **museum open-access APIs** (Met CC0 first — it has a clean JSON API and real
  Costume Institute holdings) as the image resolver for the canonical houses. Real, legal archival
  imagery for the famous names; placeholders elsewhere.
- **Phase 3 (only if warranted):** license a runway archive (Getty or Launchmetrics) for
  comprehensive per-collection runway looks. This is the paid, high-coverage tier.

## 5. Open questions for Nicole

1. **Budget** — any appetite for a licensed source (Tier 3), or stay entirely free/legal (Tiers 1–2)?
2. **Image type** — is museum *object* photography (a garment on a mannequin/flat) acceptable where
   runway isn't legally available, or does it need to be runway looks specifically?
3. **Depth** — a few signature collections per director, or every collection of their tenure?
4. **Scope of houses** — canonical houses only (where legal imagery exists), or attempt all 124
   (most indie labels will only ever have Tier 1 text)?

**Suggested default:** Phase 1 now (free, immediate, extends existing enrichment), then Phase 2 with
The Met's open-access API for the canonical houses. Revisit Tier 3 only if the coverage gap matters.

---

## Decided (Nicole)

- **Free/legal only** — Tiers 1–2. No licensed source (Tier 3) for now.
- **Museum object photography is acceptable** where runway isn't legally available — unlocks
  The Met / V&A / Europeana open-access imagery.

### Build plan
1. **Phase 1** — extend `enrich_houses` so each director also returns `collections`:
   `[{season, title, why}]` (their signature shows). New `Collection` rows keyed to
   `(brand, director_name)`. Render as a captioned strip per director in the study
   (placeholder tiles until images resolve). *Fold into the directors pass to avoid a
   third full enrichment run — do it right after the current directors backfill completes.*
2. **Phase 2** — a `resolve_archive_images` command: for each collection, query The Met
   Open Access API (CC0) first, then V&A / Europeana / Wikimedia, by `house + designer + year`;
   store `image_url + source + license + credit` on the collection, placeholder if no hit.
   Object photography allowed. Idempotent, cached per collection.
3. Frontend: per-director collection strip (image or placeholder + season + title + credit line).

---

## Built (as shipped)

Phases 1–2 are implemented and verified in-browser (Schiaparelli).

- **Data model** — `catalog.Collection` `(brand, director_name, season, year, title, why, order,
  image_url, source, source_url, license, credit, model_id)`. Migrations `0007`, `0008`.
- **Phase 1** — `enrich_collections` (`catalog/enrich.py` + management command) on `claude-opus-5`,
  additive: reads each house's already-derived `HouseLore.directors` and names their signature
  collections `[{director, season, year, title, why}]`. "Never invent seasons" — unknown directors
  return none (honest empty tiles). `build_house_study` folds collections onto each director;
  `HouseStudy` renders a captioned strip per director (season · title · critic's *why*).
- **Phase 2 — source pivot: The Met → Wikimedia Commons.** The Met's *own* Open Access API is
  **barren for 20th-C couture**: its Costume Institute garments are rights-restricted and
  image-less; a `q=Schiaparelli` search returns only unrelated CC0 antiquities (loose text match).
  **Wikimedia Commons** carries the real free fashion imagery — genuine PD/CC-BY period couture
  *and* the same museum object photography re-hosted as CC0 (`"Ball gown MET …"`). So Commons is the
  primary resolver (`catalog/archive.py` + `resolve_archive_images`). No API key; each file's exact
  licence + attribution + source page stored per row.
- **Anachronism guard.** Commons free fashion imagery is almost entirely *period* work (pre-copyright);
  contemporary runway is Getty/Vogue-owned and absent. A naïve year match is fooled by *exhibition*
  photos (a 1938 gown shot at a 2022 show has "2022" in the filename). Rule: only attach an image
  whose own year is `≤ PERIOD_MAX (1975)` and within `±YEAR_SLOP (4)` of the collection's year.
  Result: heritage-era collections get real garments; **modern collections keep their placeholder +
  critic text** — honest, since no free runway imagery exists for them.
- Attribution: each image tile shows `{author} · {licence} · Wikimedia Commons`, linking to the
  Commons file page (`source_url`).
