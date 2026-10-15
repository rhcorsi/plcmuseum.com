# ADR-0010: CSP hashes for island hydration scripts

Status: proposed, 2026-10-14. Needed before TASK-001 (CoverFlow) is integrated into real pages; Phase 0 pages have no islands and are not affected.

## Context

docs/SECURITY.md 3.1 sets `script-src 'self'; style-src 'self'` in the header CSP the Worker sends, and forbids `'unsafe-inline'`. A page with a React island built by Astro 7.3.8 contains three inline `<script>` elements (the island runtime and the `client:*` directive loaders, about 5.4 KB together) and one inline `<style>` (`astro-island,astro-slot,astro-static-slot{display:contents}`), verified on 2026-10-14 with a throwaway build. Under the documented CSP the browser refuses them, so no island hydrates in production; `astro dev` sends no CSP, which hides the problem during development.

docs/SECURITY.md anticipated this with "implement nonce injection in the Worker". Since then Astro gained a stable `security.csp` option: at build time it hashes every inline script and style it emits and writes a `<meta http-equiv="content-security-policy">` with those hashes. A meta policy and a header policy both apply, so the header must allow the same hashes.

## Options

1. **Build-time hashes, header from a manifest.** Enable `security.csp` in astro.config.mjs; the build integration (the one that already writes build.json) collects the hashes from the generated pages into a small manifest; the Worker reads it once per isolate (as it reads build.json for /api/health) and appends the hashes to `script-src` and `style-src`. Static, no per-request work beyond a header string, no `'unsafe-inline'`.
2. **Nonces injected at the edge.** The Worker rewrites every HTML response with HTMLRewriter, adds a fresh nonce to each inline script and style and to the header. Per-request CPU on every page; it also blesses any inline script present in the HTML, which weakens the guarantee that only build-time code runs.
3. **No inline scripts.** Not possible with Astro islands today.

## Decision (proposed)

Option 1.

## Consequences

- The CSP stays free of `'unsafe-inline'`; docs/SECURITY.md 3.1 changes "nonce injection in the Worker" to "build-time hashes read by the Worker".
- Upgrading Astro may change the runtime scripts; the hashes regenerate with the build, and an e2e test that loads pages through `wrangler dev` and fails on console CSP violations keeps the two in step.
- Until this lands, an island on a real page must not be merged: the architect integrates TASK-001 together with this change.
