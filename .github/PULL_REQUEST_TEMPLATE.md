## What this PR does

<!-- One paragraph. Link the issue or task file (docs/tasks/TASK-xxx.md) if any. -->

## Type

- [ ] Content (exhibit, correction, translation review)
- [ ] Illustration or image (with license sidecar)
- [ ] Code (component, island, script, worker)
- [ ] Docs

## Checklist

- [ ] `pnpm validate:content && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass locally
- [ ] Every new fact has a source in `sources`; unsourced fields are `null` and listed in `verification.unverified_fields`
- [ ] Every new image has a `.meta.json` sidecar with author, license and attribution; no logos, vendor press or marketplace photos
- [ ] No personal data (contact details, third-party names without consent), no story files
- [ ] No secrets, tokens, `.env` or `.dev.vars`; no files under `docs/private/` or `content/private/`
- [ ] No new dependency (or a maintainer agreed in an issue)
- [ ] Commits are signed off (`git commit -s`, DCO)
- [ ] AI tools used: <!-- yes/no; if yes, which parts -->

## Screenshots (UI changes)

<!-- 390 px and 1280 px; per era when themes are affected. -->
