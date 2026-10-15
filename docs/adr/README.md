# Architecture Decision Records

Format: context, decision, consequences. New ADRs are added as `docs/adr/NNNN-title.md`, or appended here while they are short. Changing a decision means a new ADR that supersedes the old one.

## ADR-0001: Static site on Cloudflare Workers with static assets

Context: content-heavy, spiky traffic, one maintainer, security matters. Options: Next.js SSR on Workers (OpenNext), Astro static, Cloudflare Pages.
Decision: Astro with static output (major version 7 since ADR-0009), served by a Worker through the assets binding (Cloudflare's recommended path for new projects); React islands only for interactive parts.
Consequences: zero per-request compute for pages, minimal attack surface, simple caching; dynamic features must be designed as build-time or as a separate tiny API. Pages is not used.

## ADR-0002: Content as JSON files with JSON Schema, validated in CI and in editor hooks

Context: three AI tools and a human edit content; hallucinated specs are the main credibility risk.
Decision: one JSON file per exhibit, schema-validated; `sources` required for publication; images need a license sidecar; publication gated by `verification.level`.
Consequences: adding content never touches code; validation is mechanical; the curator subagent can be strict. Cost: some duplication between JSON Schema and Zod (mitigated by generating types from the schema).

## ADR-0003: No WebGL in the MVP

Context: the reference experience is a 3D Cover Flow. Three.js adds bundle size, accessibility work and a dependency on 3D assets that do not exist.
Decision: CSS 3D transforms, scroll-snap and cut-out images. Revisit only when licensed 3D scans exist and the community asks for them.
Consequences: lighter, accessible, works on low-end phones; the "wow" comes from motion and era theming, not from meshes.

## ADR-0004: Stories through a single POST endpoint with D1, moderated offline, published as static files

Context: community stories are the engagement engine; a public database or comment system would be the largest attack surface.
Decision: `POST /api/stories` stores pending submissions in D1; nothing is readable through the API; the owner exports approved stories into `content/stories/` and the site rebuilds.
Consequences: the public site stays static; moderation is a weekly chore with a CLI; a story appears hours or days after submission, which is acceptable and sets expectations.

## ADR-0005: Five languages in the site from day one, two languages in the community program

Context: pt, en, es, de, it map the main automation communities; the costly part is conversation, not translation.
Decision: UI and exhibit text in all five, with per-language status and a "help us review" badge for machine translations; stories stay in their original language; LinkedIn program in pt and en first.
Consequences: recruits native curators instead of promising native quality; avoids burnout.

## ADR-0006: Multi-AI roles with contract-first handoffs

Context: Claude Code (architecture), Codex (islands), Gemini (design and motion) working in parallel.
Decision: Claude Code publishes types, fixtures, tokens and a task file before any implementation; implementers work in worktrees on feature branches with explicit allowed paths; Claude Code reviews and merges; production deploy is human until Phase 3.
Consequences: predictable integration, fewer conflicts, review as the single quality gate; some overhead in writing tasks, which doubles as documentation.

## ADR-0007: Public repository from the first commit

Context: the project wants outside contributors (developers, curators, translators). Git history cannot be made private later, and forks copy it.
Decision: the repository is public from commit one. Secrets live only in Cloudflare and GitHub Environments; private notes live in the gitignored `docs/private/`; a pre-commit hook (gitleaks + public-safety check) and CI enforce it; CODEOWNERS and branch protection gate every merge; fork PRs run without secrets and `pull_request_target` is banned.
Consequences: nothing sensitive is ever "temporarily" committed; the owner keeps a private notes folder or repo; contributors get a clean, documented project. Cost: a short checklist before the first push and discipline about where notes go.

## ADR-0008: Community stories are never stored in git (supersedes the export-to-repo part of ADR-0004)

Context: a public repository with contributor display names in immutable history makes LGPD/GDPR removal requests impossible to honor fully, and forks would keep copies.
Decision: stories stay in D1. Moderation happens in D1 (`pnpm stories:moderate`). The deploy pipeline runs `pnpm stories:fetch` with the scoped token, writes approved stories to the gitignored `content/stories/` cache, and builds. Fork and contributor builds use `src/fixtures/stories.ts`. Removal is one row delete plus a redeploy.
Amended 2026-10-15 (Phase 0): the fictional fixtures fill in only at the development stage (`pnpm dev`, or a build with `PLCMUSEUM_STAGE=development`); preview and production builds never show them, and `pnpm stories:fetch` fails without a token instead of falling back.
Consequences: the public site stays static; the repository holds no personal data; the build is still a pure function of its inputs (repository + approved stories at deploy time). Cost: the deploy job needs the D1 token, which the protected environment already holds.

## ADR-0009: Astro 7 instead of Astro 5 (amends ADR-0001)

Accepted 2026-10-14. Astro 5 had a critical and several high advisories fixed only in Astro 6 and 7, which broke the `pnpm audit` gate; the project moved to Astro 7 before any page existed. Full record: `docs/adr/0009-astro-7.md`.

## ADR-0010: CSP hashes for island hydration scripts

Accepted 2026-10-15. Astro islands need inline hydration scripts, which the CSP refuses; Astro's `security.csp` hashes them at build time, the build lists the hashes in `dist/csp.json` and the Worker adds them to `script-src` and `style-src`, so `'unsafe-inline'` stays out. Full record: `docs/adr/0010-csp-hashes-for-islands.md`.

## ADR-0011: Header controls without React

Accepted 2026-10-15. EraToggle and LanguageSwitch are script components (an Astro component plus a same-origin TypeScript module, no framework, at most 3.5 KB gzip together), so exhibit pages stay within their JS budget; the language picked with a plain click is remembered in localStorage and followed on a language home reached through the `/` redirect, with no cookie and no Worker change. Full record: `docs/adr/0011-header-controls-without-react.md`.

## ADR-0012: Preferences applied before first paint

Accepted and implemented 2026-10-15. A classic, render-blocking, same-origin `/prefs.js` first in every `<head>` applies the stored era and follows the remembered language before first paint, with no CSP change and a budget of 1 KB gzip. Full record: `docs/adr/0012-preferences-before-first-paint.md`.
