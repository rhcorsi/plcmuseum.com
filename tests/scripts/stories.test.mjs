// Story script skeletons (Phase 0): refuse to run without a token, validate their inputs, and never echo the token.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempTree, removeTree, runScript, writeFiles } from './helpers.mjs';

// Obviously fake, and kept in a variable so no assignment in this file looks like a credential literal.
const FAKE_VALUE = 'test-token-value-not-real';
const withToken = (extra = {}) => ({ CLOUDFLARE_API_TOKEN: FAKE_VALUE, ...extra });

describe('stories-fetch', () => {
  const FETCH = 'scripts/stories-fetch.mjs';
  let tmp;
  beforeEach(() => {
    tmp = makeTempTree();
  });
  afterEach(() => {
    removeTree(tmp);
  });

  it('exits 1 without a token and names the missing variable', () => {
    const r = runScript(FETCH, [], { cwd: tmp });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('CLOUDFLARE_API_TOKEN');
    expect(existsSync(path.join(tmp, 'content', 'stories'))).toBe(false);
  });

  it('with a token, leaves an empty cache and never prints the token', () => {
    writeFiles(tmp, { 'content/stories/fx-test/st-stale0001.json': { id: 'st-stale0001' } });
    const r = runScript(FETCH, [], { cwd: tmp, env: withToken() });
    expect(r.status, r.output).toBe(0);
    expect(readdirSync(path.join(tmp, 'content', 'stories'))).toEqual([]);
    expect(r.output).not.toContain(FAKE_VALUE);
    expect(r.output).not.toContain(FAKE_VALUE.slice(0, 8));
  });

  it('exits 1 on an unknown STORIES_ENV', () => {
    const r = runScript(FETCH, [], { cwd: tmp, env: withToken({ STORIES_ENV: 'staging' }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('STORIES_ENV');
    expect(r.output).not.toContain(FAKE_VALUE);
  });
});

describe('stories-moderate', () => {
  const MODERATE = 'scripts/stories-moderate.mjs';

  it('exits 1 without a token', () => {
    const r = runScript(MODERATE, ['--list']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('rejects a malformed story id before anything else', () => {
    const r = runScript(MODERATE, ['--approve', 'bad-id'], { env: withToken() });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('invalid story id(s): bad-id');
  });

  it('rejects an unknown --env', () => {
    const r = runScript(MODERATE, ['--list', '--env', 'staging'], { env: withToken() });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--env must be one of');
  });

  it('prints usage with --help', () => {
    const r = runScript(MODERATE, ['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Usage: pnpm stories:moderate');
  });

  it('with a token, refuses until Phase 3 and never prints the token', () => {
    const r = runScript(MODERATE, ['--reject', 'st-abcdefgh,st-12345678'], { env: withToken() });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('implemented in Phase 3');
    expect(r.output).not.toContain(FAKE_VALUE);
  });
});
