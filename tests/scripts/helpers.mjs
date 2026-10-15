// Shared helpers for the script tests: run a repository script in a chosen working directory (the scripts resolve
// every path from process.cwd()) and build throwaway trees under the OS temp directory.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));

// Cloudflare variables from the developer's shell must never reach a script under test.
const SCRUBBED = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'STORIES_ENV'];

function baseEnv() {
  const env = { ...process.env };
  for (const name of SCRUBBED) delete env[name];
  return env;
}

export function runScript(script, args = [], { cwd = REPO, env = {} } = {}) {
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd,
    env: { ...baseEnv(), ...env },
    encoding: 'utf8',
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status, stdout, stderr, output: stdout + stderr };
}

/** A temp tree with a copy of content/schema, which every validator run needs. */
export function makeTempTree() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'plcmuseum-test-'));
  cpSync(path.join(REPO, 'content', 'schema'), path.join(dir, 'content', 'schema'), { recursive: true });
  return dir;
}

/** Writes files under `root`; objects are written as JSON. */
export function writeFiles(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(root, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
}

export function removeTree(dir) {
  rmSync(dir, { recursive: true, force: true });
}
