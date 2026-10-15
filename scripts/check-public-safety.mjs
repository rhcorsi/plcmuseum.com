#!/usr/bin/env node
// Fails when something that must never be public is about to be committed or is tracked.
// Usage: node scripts/check-public-safety.mjs [--staged]
//   --staged  check only files staged in git (pre-commit), as staged: the content checked is the index blob, which
//             is what the commit records; default checks git-tracked files (or the whole tree when git is
//             unavailable).
import { execFileSync } from 'node:child_process';
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
  // Local Claude Code state: plugin data and personal settings can hold paths, tokens or session details.
  /(^|\/)\.claude\/data\//,
  /(^|\/)\.claude\/settings\.local\.json$/,
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
const IGNORED_DIRS =
  /^(node_modules|\.git|dist|\.astro|\.wrangler|docs\/private|content\/private|content\/stories|\.claude\/data|playwright-report|test-results)(\/|$)/;

const MAX_BYTES = 2_000_000;
const GIT_OUTPUT = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 };

/** Files to check, and whether their content comes from the git index (--staged in a repository). */
function listFiles() {
  try {
    // -z: NUL-separated and unquoted, so a non-ASCII path ("docs/private/café.md") reaches the path rules as is.
    const args = staged ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'] : ['ls-files', '-z'];
    return { files: execFileSync('git', args, GIT_OUTPUT).split('\0').filter(Boolean), fromIndex: staged };
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
    return { files: out, fromIndex: false };
  }
}

/** Text of a file, or null when it is missing, too large or unreadable. */
function readText(name, fromIndex) {
  try {
    if (fromIndex) {
      // The commit records the staged blob, not the working copy: a secret staged and then reverted on disk
      // would still be committed. A blob over maxBuffer throws and is skipped like any oversized file.
      const text = execFileSync('git', ['show', `:${name}`], { ...GIT_OUTPUT, maxBuffer: 8 * 1024 * 1024 });
      return Buffer.byteLength(text) > MAX_BYTES ? null : text;
    }
    const abs = path.join(ROOT, name);
    if (!existsSync(abs) || statSync(abs).size > MAX_BYTES) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

const problems = [];
const { files, fromIndex } = listFiles();
for (const f of files) {
  const relp = f.replace(/\\/g, '/');
  if (FORBIDDEN_PATHS.some((re) => re.test(relp))) {
    problems.push(`${relp}: forbidden path (must never be committed)`);
    continue;
  }
  // Read by the name git gave: on Linux a backslash is a legal file name character, not a separator.
  const text = readText(f, fromIndex);
  if (text === null) continue;
  if (text.slice(0, 1024).includes('\u0000')) continue; // binary
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
