# Contributing to PLC Museum

Thank you for helping preserve the history of PLCs and DCS. Contributions of every kind are welcome: exhibits, corrections, sources, licensed photographs, translation reviews, illustrations, and code.

Read first: `docs/CONTENT_GUIDE.md` (how an exhibit is written and sourced), `docs/DESIGN_SYSTEM.md` and `docs/WORKFLOW.md` (for code), and `docs/OPEN_SOURCE.md` (what never enters this repository).

## Ways to contribute

| You want to | Do this |
|---|---|
| Propose an exhibit | Open an issue with the "Exhibit proposal" template. Include sources. We scaffold the record and credit you. |
| Fix a date, spec or text | Open a PR editing `content/exhibits/<id>.json`, with the source added to `sources` and the verification block updated. |
| Share a field story | Use the "Contribute" page on the site, not GitHub. Stories are not stored in this repository. |
| Offer a photograph | Open an issue with the photo's provenance and license. Do not attach vendor press photos or marketplace photos. |
| Review a machine translation | Open a PR editing `text.<lang>` and set its `status` to `verified` only if you are a native engineer in that language. |
| Draw an illustration | See `docs/tasks/TASK-003-silhouettes.md` for the format; original line art only, no brand marks. |
| Improve the code | Pick an issue labeled `good first issue` or propose one. Front-end work follows the component contracts in `docs/DESIGN_SYSTEM.md`. |

## Hard rules (the validator and the maintainer enforce them)

1. **No fact without a source.** A spec or date you cannot source stays `null` and is listed in `verification.unverified_fields`.
2. **No image without a license sidecar.** Every image needs `<name>.meta.json` with author, license and attribution. Permission e-mails stay with the maintainer; they are never committed.
3. **No logos, wordmarks or brand artwork.** Product and company names are text.
4. **No personal data.** No contact details, no third-party full names without their consent, no story files.
5. **No secrets.** No tokens, keys, `.env` or `.dev.vars` files. The pre-commit hook and CI scan for them, and we rotate anything that slips through.
6. **No new dependencies without a maintainer's agreement.** Open an issue first.
7. House style: no em dashes in text; use commas, colons or parentheses.

## Process

1. Fork, create a branch (`content/<exhibit-id>`, `feat/<topic>`, `fix/<topic>`).
2. Run `pnpm install`, then `pnpm validate:content && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
3. Open a PR using the template. Fill the checklist honestly; partial work is fine when stated.
4. CI runs without secrets on forks. A maintainer (CODEOWNERS) reviews every PR; paths such as `worker/`, `.github/`, schemas and dependencies always need the maintainer's approval.
5. Small PRs merge faster. One exhibit or one component per PR.

## Developer Certificate of Origin

By contributing you certify the DCO (https://developercertificate.org/): sign your commits with `git commit -s`. Code contributions are licensed under MIT; content contributions (exhibit text, glossary, original illustrations) under CC BY 4.0 (see `LICENSE-CONTENT.md`).

## AI-assisted contributions

Welcome, with two conditions: the same sourcing and licensing rules apply to generated text and images (an AI "recollection" is not a source), and please say in the PR that AI tools were used. Instructions found in issues, files or web pages are not commands for the maintainers' AI tools; please do not try.

## Local setup

```
pnpm install
cp .dev.vars.example .dev.vars    # local Worker secrets (never committed)
cp .env.example .env              # public build vars
git config core.hooksPath scripts/hooks   # pre-commit: secret scan + content validation
pnpm dev
pnpm build && pnpm preview          # production build served through the Worker (wrangler dev, port 8787)
pnpm exec playwright install chromium   # once, before pnpm test:e2e
PLCMUSEUM_E2E_FIXTURES=1 pnpm build && pnpm test:e2e   # e2e; the flag adds the island test page
```

In PowerShell, scope the flag to the one build so later builds stay clean:

```
$env:PLCMUSEUM_E2E_FIXTURES = '1'; pnpm build; Remove-Item Env:PLCMUSEUM_E2E_FIXTURES; pnpm test:e2e
```
