# Worker: static assets + stories API

One Worker serves `dist/` (Astro static output) through the assets binding and exposes two routes. Everything else under `/api/` returns 404. Security headers (see docs/SECURITY.md 3.1) are added to every response.

## Routes

### `GET /` (edge redirect)
Reads `Accept-Language`, picks the first supported language (pt, en, es, de, it), redirects 302 to `/<lang>/`. Fallback `/en/`. No cookies.

### `POST /api/stories`
Request: `Content-Type: application/json`, body <= 8 KB:
```json
{
  "exhibit_id": "ab-plc-5",
  "display_name": "Carlos M.",
  "role": "Engenheiro de automação",
  "country": "BR",
  "original_lang": "pt",
  "year_of_memory": 1998,
  "text": "...",
  "contact_email": "optional@example.com",
  "consent": { "publish_with_display_name": true, "license": "CC-BY-4.0", "machine_translation": true },
  "turnstile_token": "...",
  "website": ""
}
```
`website` is a honeypot: any non-empty value is silently accepted with 202 and discarded.

Processing: Zod validation mirroring `content/schema/story.schema.json` (limits identical), Turnstile siteverify with the secret, rate limit (Cloudflare rule + `ip_hash` count per 24 h <= 5), strip HTML tags and control characters, insert with `status = 'pending'`.

Responses: `202 {"id":"st-..."}` on success; `400` on validation or Turnstile failure (generic message, no field hints beyond what the client already validates); `413` on oversized body; `415` on wrong content type; `429` on rate limit. Never echoes stored data.

### `GET /api/health`
`200 {"ok":true,"build":"<git sha>","date":"<build date>"}`. No secrets, no DB access.

## Bindings (wrangler.jsonc)
- `ASSETS`: static assets (`dist/`).
- `DB`: D1 `plcmuseum-stories` (schema in `schema.sql`).
- Secrets (`wrangler secret put`): `TURNSTILE_SECRET`, `IP_HASH_SALT` (rotate monthly).
- Vars: `TURNSTILE_SITE_KEY` (public), `ENVIRONMENT`.

## Scheduled job (Cron Trigger, daily)
Delete `rejected` rows older than 30 days; null out `ip_hash` older than 30 days.

## Moderation (owner only, local) and publication (deploy only)
`pnpm stories:moderate --list` prints pending stories; `--approve <id,...>` and `--reject <id,...>` update rows in D1 through `wrangler d1 execute` with the owner's credentials (Claude Code is denied these commands by `.claude/settings.json`). Publication: the deploy workflow runs `pnpm stories:fetch`, which reads approved rows (no contact e-mail, no ip hash) into the gitignored `content/stories/` cache for the build. Stories are never committed to the repository (ADR-0008); when `stories:fetch` has no token (fork or contributor build) the build uses `src/fixtures/stories.ts`.
