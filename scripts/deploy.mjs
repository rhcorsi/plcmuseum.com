#!/usr/bin/env node
// Local deploy for the owner only, always a human action (CLAUDE.md: production deploy is never automated by an
// agent). Runs the gates of .github/workflows/deploy.yml in order, then deploys, and stops at the first failure.
// Usage: node scripts/deploy.mjs <preview|production>   (pnpm deploy:preview, pnpm deploy:prod)
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (stories:fetch and wrangler read them).
// Prints step names only, never an environment value.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = ['preview', 'production'];
const args = process.argv.slice(2);
const target = args[0];
if (args.length !== 1 || !TARGETS.includes(target)) {
  console.error('Usage: node scripts/deploy.mjs <preview|production>');
  process.exit(1);
}

// The child scripts resolve every path from their working directory, so they run from the repository root.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const nodeModule = (...p) => path.join(ROOT, 'node_modules', ...p);

// docs/SECURITY.md 3.4: production deploys only from main, and build.json must name the commit that is deployed,
// so a production deploy refuses another branch or uncommitted changes.
if (target === 'production') {
  const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' }).trim();
  let branch;
  try {
    branch = git('symbolic-ref', '--short', '-q', 'HEAD');
  } catch {
    branch = '(detached HEAD)';
  }
  if (branch !== 'main') {
    console.error(`deploy: production deploys only from main (current branch: ${branch}).`);
    process.exit(1);
  }
  if (git('status', '--porcelain') !== '') {
    console.error('deploy: the working tree has uncommitted changes; commit or stash them first.');
    process.exit(1);
  }
}

// Every step is a Node entry point run with this Node: no shell, and the same command on every platform.
const STEPS = [
  { name: 'public-safety check', args: ['scripts/check-public-safety.mjs'] },
  { name: `fetch approved stories (${target})`, args: ['scripts/stories-fetch.mjs'], env: { STORIES_ENV: target } },
  // After the fetch, so the cached stories are validated along with the exhibits.
  { name: 'validate content', args: ['scripts/validate-content.mjs'] },
  {
    name: `astro build (${target})`,
    args: [nodeModule('astro', 'bin', 'astro.mjs'), 'build'],
    // Set explicitly, overriding the shell: an inherited stage would publish the wrong set of exhibits.
    env: { PLCMUSEUM_STAGE: target },
  },
  {
    name: `wrangler deploy (${target})`,
    args: [
      nodeModule('wrangler', 'bin', 'wrangler.js'),
      'deploy',
      ...(target === 'preview' ? ['--env', 'preview'] : []),
    ],
  },
];

for (const step of STEPS) {
  console.log(`\ndeploy: ${step.name}`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...step.env },
  });
  if (result.error) {
    console.error(`deploy: ${step.name} could not start (${result.error.code ?? 'error'}); stopping.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`deploy: ${step.name} failed (${result.status ?? result.signal}); stopping.`);
    process.exit(result.status || 1);
  }
}
console.log(`\ndeploy: ${target} deployed.`);
