# Content guide (curation rules)

The museum's credibility is its only asset. A wrong scan time or a wrong launch year costs more than a missing one. These rules are enforced by `scripts/validate-content.mjs` and by the `curator` subagent.

## 1. Anatomy of an exhibit

One JSON file per exhibit in `content/exhibits/<id>.json` (schema: `content/schema/exhibit.schema.json`). Sections:

- **Identity**: `id`, `slug`, `name` (as the manufacturer named it at launch), `family`, `manufacturer` (brand at launch), `brand_at_launch`, `current_owner` (who owns the brand now, e.g., Modicon → Schneider Electric; Allen-Bradley → Rockwell Automation), `country_of_origin`.
- **Classification**: `category` (plc, dcs, multiloop, hmi, programmer, network, software), `architecture` (modular, compact, micro, pac, dcs_redundant, multiloop, software_defined), `sectors`, `decade`, `year_introduced`, `year_introduced_precision` (exact, approximate, disputed) with the dispute explained in `verification.notes`.
- **Specs** (language-neutral, nullable): `cpu`, `scan_time_ms_per_k`, `memory_words`, `memory_kb`, `memory_type`, `io_max`, `networks[]`, `languages[]` (IEC 61131-3 codes plus `proprietary`).
- **Lifecycle** (the "still running in your plant" angle): `discontinued_year`, `end_of_support_year`, `last_firmware`, `migration_paths[]`, `still_in_service_note`. This block is what makes the museum useful to working engineers; fill it from vendor lifecycle pages and record the access date.
- **Text per language**: `tagline` (≤ 120 chars, one memorable claim), `summary` (≤ 600 chars, why it mattered), `field_quirk` (≤ 240 chars, the thing every veteran remembers), `alt_text`. Each language block has `status`: `verified` (human), `machine` (AI, glossary-based), `needs_review`.
- **Sources**: typed list. Types: `manual`, `datasheet`, `vendor_history`, `book`, `article`, `interview`, `standard`, `archive`, `wikipedia_pointer` (allowed only to point to a primary source listed too). Each source has `title`, `publisher`, `url` or `isbn`, `year`, `accessed`, `note` (what it supports).
- **Verification**: `level` (unverified, partial, verified), `unverified_fields[]` (JSON paths), `reviewer`, `date`, `notes`.
- **Images**: files under `content/images/<id>/` with sidecar meta. **Links**: partner (Automation Museum episodes), vendor history, video, manual, community. **related_modules**: CPU variants, racks, programmers, cables that veterans remember (e.g., programming terminals, EPROM cartridges, DH+ cable).

## 2. Source policy

- A fact is publishable when at least one typed source supports it and the source is accessible (URL alive at `accessed` date, or a book/ISBN).
- Preferred: original manuals and datasheets (vendor literature libraries), vendor history pages, period magazine articles, books, recorded interviews with named people.
- Not accepted as sole source: forum posts, marketplace listings, AI output, memory.
- Disputed dates (first shipment vs announcement vs patent) are shown as "approx." with the dispute explained; never pick one silently.
- The curator never fills a field it cannot source. `null` plus `unverified_fields` is correct; a plausible number is a bug.

## 3. Images and trademarks

- Allowed sources: photos taken by the owner or contributors with written permission (meta `license: permission-granted`, evidence file path), Wikimedia Commons with compatible license (CC0, CC BY, CC BY-SA, with attribution text copied into meta), own illustrations, public-domain documents.
- Not allowed: vendor press photos, marketplace photos, screenshots of copyrighted software unless the owner has permission, anything with unknown provenance.
- SVG files (exhibit illustrations and `src/assets/illustrations/`) are checked by the validator: no `<script>`, `<foreignObject>`, `<image>`, event-handler attributes, `javascript:`, `<!ENTITY>`, href animations or remote `url()`/`@import`; every `href` is a same-document `#` reference. Plain SVG only: elements from the allowlist in `scripts/validate-content.mjs` (svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, title, desc, defs, use, symbol, linearGradient, radialGradient, stop, clipPath, mask, pattern, style, metadata), only the SVG and XLink namespaces (editor exports such as Inkscape or sodipodi attributes must be cleaned), no named or numeric character references beyond the five XML ones, no backslashes, no @import or image-set(), no src/action/data attributes. Illustrations have a root `<svg id="art" viewBox="0 0 640 260">` and strokes in `currentColor`, so pages can draw them with `<use href="...#art">` in the colors of every era.
- Logos and wordmarks are never stored or drawn. Brand names appear as text. The site footer carries a nominative-use notice: product and company names are used for identification and historical description only; no affiliation or endorsement implied.
- A photo that shows a logo on the device is fine (that is the device); the logo must not be extracted, enlarged or used as UI.
- Every image meta file records: `author`, `license`, `source_url`, `attribution_text`, `permission_evidence` (a reference such as "e-mail from the author, 2026-10-02, kept in the owner's private archive"; the e-mail itself is never committed, this repository is public), `modifications` (cut-out, color correction).

## 4. Writing style

- Tagline: a claim an engineer would repeat at a bar, not marketing copy. Example shape: "The first PLC, built to end the yearly relay-panel rewiring at GM."
- Summary: why it mattered, what it replaced, what came after. No superlatives without a source.
- Field quirk: the shared memory (addressing scheme, cable, battery, cartridge, terminal). Plain, affectionate, precise.
- Brazilian chapter: Altus, Smar, Atos, WEG, HI Tecnologia and others get the same treatment and the same sourcing standard; founders and former employees are prime interview sources (record consent).
- Never attribute quotes to real people without a recorded source and consent.

## 5. Stories (community)

- Published only after owner approval, in the contributor's language, labeled with display name, role, country and year of memory.
- No full names of third parties unless the contributor is that person or has their consent; company names are fine when the story is not defamatory.
- Light edits only for typos, with the contributor's consent; never rewrite voice.
- License: CC BY 4.0 with the display name as attribution; consent stored with the submission.
- Storage: stories live in D1 and are fetched at deploy time; they are never committed to this public repository, so a contributor's removal request is honored by one row delete and a redeploy (ADR-0008).

## 6. Review states

`draft` (being written) → `review` (facts complete, awaiting owner) → `published` (verified, licensed image or silhouette, pt and en verified). Only `published` exhibits are built into the public site; `review` ones appear on preview.
