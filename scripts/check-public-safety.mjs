#!/usr/bin/env node
// Fails when something that must never be public is about to be committed or is tracked.
// Usage: node scripts/check-public-safety.mjs [--staged]
//   --staged  check only files staged in git (pre-commit); default checks git-tracked files
//             (or the whole tree when git is unavailable).
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const staged = process.argv.includes('--staged');
const ROOT = process.cwd();

const FORBIDDEN_PATHS = [
  /(^|\/)\.env($|\.(?!example$))/,
  /(^|\/)\.dev\.vars($|\.(?!example$))/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)\.secrets\//,
  /(^|\/)docs\/private\//,
  /(^|\/)content\/private\//,
  /(^|\/)content\/stories\//,
  /permission-evidence/i,
  /(^|\/)node_modules\//,
];

// `only` restricts a rule to paths matching the regex (content files carry contributor data rules).
const FORBIDDEN_CONTENT = [
  { re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, why: 'private key block' },
  { re: /CLOUDFLARE_API_TOKEN\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/, why: 'Cloudflare API token literal' },
  { re: /TURNSTILE_SECRET\s*[:=]\s*['"]?0x[0-9A-Za-z]{20,}/, why: 'Turnstile secret literal' },
  { re: /"contact_email"\s*:/, why: 'contributor contact e-mail in a content file', only: /^content\// },
  { re: /"ip_hash"\s*:/, why: 'ip hash in a content file', only: /^content\// },
];

// Directories that are gitignored by design; skipped in the no-git tree walk (git mode never lists them).
const IGNORED_DIRS = /^(node_modules|\.git|dist|\.astro|\.wrangler|docs\/private|content\/private|content\/stories|playwright-report|test-results)(\/|$)/;

function listFiles() {
  try {
    const cmd = staged ? 'git diff --cached --name-only --diff-filter=ACMR' : 'git ls-files';
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    const out = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        const relp = path.relative(ROOT, full).replace(/\\/g, '/');
        if (IGNORED_DIRS.test(relp)) continue;
        if (e.isDirectory()) walk(full);
        else out.push(relp);
      }
    };
    walk(ROOT);
    return out;
  }
}

const problems = [];
for (const f of listFiles()) {
  const relp = f.replace(/\\/g, '/');
  if (FORBIDDEN_PATHS.some((re) => re.test(relp))) {
    problems.push(`${relp}: forbidden path (must never be committed)`);
    continue;
  }
  const abs = path.join(ROOT, relp);
  if (!existsSync(abs) || statSync(abs).size > 2_000_000) continue;
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (/\u0000/.test(text.slice(0, 1024))) continue; // binary
  if (relp === 'scripts/check-public-safety.mjs' || relp === '.gitleaks.toml') continue;
  for (const { re, why, only } of FORBIDDEN_CONTENT) {
    if (only && !only.test(relp)) continue;
    if (re.test(text)) problems.push(`${relp}: ${why}`);
  }
}

if (problems.length) {
  console.error('Public-safety check failed:');
  for (const p of problems) console.error(`  ${p}`);
  console.error('Remove the file or value, rotate any real secret, then commit again. See docs/OPEN_SOURCE.md.');
  process.exit(1);
}
console.log(`public-safety: ok (${staged ? 'staged files' : 'tracked files'})`);
