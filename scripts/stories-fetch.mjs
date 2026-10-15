#!/usr/bin/env node
// Deploys only (.github/workflows/deploy.yml and the owner's scripts/deploy.mjs): copies approved stories from D1 into the gitignored
// content/stories/ cache that the build reads (ADR-0008). Stories are never committed.
// Usage: pnpm stories:fetch   (env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, STORIES_ENV=preview|production)
// Phase 0 skeleton: the D1 read lands in Phase 3. Until then a run with a token leaves the cache empty.
// The token is only ever tested for presence: never print, log or write it, not even partially.
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), 'content', 'stories');
const ENVS = ['preview', 'production'];

if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
  console.error(
    [
      'stories:fetch: CLOUDFLARE_API_TOKEN is not set.',
      'This script copies approved stories from D1 into the gitignored content/stories/ cache for a deploy build.',
      'It runs only in deploys (the deploy workflow, or pnpm deploy:preview and deploy:prod run by the owner), with a scoped token.',
      'Contributor and fork builds do not need it, and `pnpm dev` uses the fictional src/fixtures/stories.ts.',
    ].join('\n'),
  );
  process.exit(1);
}

const env = process.env.STORIES_ENV || 'production';
if (!ENVS.includes(env)) {
  console.error(`stories:fetch: STORIES_ENV must be one of ${ENVS.join(', ')} (got "${env}").`);
  process.exit(1);
}

console.log(`stories:fetch (${env}): fetching approved stories from D1 is implemented in Phase 3.`);

// The cache mirrors D1, so a run that fetched nothing leaves it empty: a stale cache must not outlive the run,
// and preview and production builds render zero stories rather than falling back to fixtures.
await rm(CACHE_DIR, { recursive: true, force: true });
await mkdir(CACHE_DIR, { recursive: true });
console.log(`stories:fetch: ${path.relative(process.cwd(), CACHE_DIR)} is empty; the build will render 0 stories.`);
