// Repository tooling that CI, the deploy pipeline and Claude Code run: image pipeline skeleton, type drift guard,
// the public-safety check, the post-edit hook and the local deploy script's argument check.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempTree, REPO, removeTree, runScript, writeFiles } from './helpers.mjs';

describe('post-edit hook', () => {
  // The hook runs scripts/validate-content.mjs from its working directory. A stub that always fails makes the
  // exit code say whether the hook chose to validate, independent of the repository's content.
  let tmp;
  beforeEach(() => {
    tmp = makeTempTree();
    writeFiles(tmp, { 'scripts/validate-content.mjs': 'process.exit(1);\n' });
  });
  afterEach(() => {
    removeTree(tmp);
  });
  const runHook = (filePath) =>
    spawnSync(process.execPath, [path.join(REPO, 'scripts', 'hooks', 'post-edit.mjs')], {
      cwd: tmp,
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
    });

  it.each([
    ['src/assets/illustrations/rack.svg', 2],
    ['D:\\repo\\src\\assets\\illustrations\\rack.meta.json', 2],
    ['content/exhibits/fx-test.json', 2],
    ['C:\\repo\\content\\images\\fx-test\\hero.svg', 2],
    ['src/assets/other/rack.svg', 0],
    ['src/pages/index.astro', 0],
  ])('%s exits %i', (filePath, status) => {
    expect(runHook(filePath).status).toBe(status);
  });
});

describe('images-process', () => {
  const IMAGES = 'scripts/images-process.mjs';

  it('exits 0 on the repository (no raster images yet)', () => {
    const r = runScript(IMAGES);
    expect(r.status, r.output).toBe(0);
    expect(r.stdout).toContain('no raster images to process');
  });

  it('exits 1 and lists rasters it cannot process yet', () => {
    const tmp = makeTempTree();
    try {
      writeFiles(tmp, { 'content/images/fx-test/photo.png': 'not really a png' });
      const r = runScript(IMAGES, [], { cwd: tmp });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('content/images/fx-test/photo.png');
    } finally {
      removeTree(tmp);
    }
  });
});

describe('gen-types', () => {
  it('reports src/content/types.ts as up to date', { timeout: 60_000 }, () => {
    const r = runScript('scripts/gen-types.mjs', ['--check']);
    expect(r.status, r.output).toBe(0);
  });
});

describe('check-public-safety', () => {
  const SAFETY = 'scripts/check-public-safety.mjs';

  it('passes on the repository', () => {
    const r = runScript(SAFETY);
    expect(r.status, r.output).toBe(0);
  });

  describe('in a temp git repository', () => {
    const hasGit = spawnSync('git', ['--version']).status === 0;
    let tmp;
    const git = (...args) => spawnSync('git', args, { cwd: tmp, encoding: 'utf8' });
    beforeEach(() => {
      tmp = makeTempTree();
    });
    afterEach(() => {
      removeTree(tmp);
    });

    it.skipIf(!hasGit)('refuses staged local Claude Code state', () => {
      writeFiles(tmp, {
        '.claude/data/plugin-state.json': {},
        '.claude/settings.local.json': {},
        '.claude/settings.json': {},
      });
      expect(git('init', '-q').status).toBe(0);
      expect(git('add', '.').status).toBe(0);
      const r = runScript(SAFETY, ['--staged'], { cwd: tmp });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('.claude/data/plugin-state.json: forbidden path');
      expect(r.stderr).toContain('.claude/settings.local.json: forbidden path');
      expect(r.stderr).not.toContain('.claude/settings.json:');
    });

    it.skipIf(!hasGit)('checks the staged blob, not the working copy', () => {
      // Built at runtime from repeated characters: no line of this file looks like a credential.
      const leak = `CLOUDFLARE_API_TOKEN=${'x'.repeat(40)}\n`;
      writeFiles(tmp, { 'notes/config.txt': leak });
      expect(git('init', '-q').status).toBe(0);
      expect(git('add', 'notes/config.txt').status).toBe(0);
      writeFiles(tmp, { 'notes/config.txt': 'reverted on disk, still staged\n' });
      const r = runScript(SAFETY, ['--staged'], { cwd: tmp });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('notes/config.txt: Cloudflare API token literal');
    });

    it.skipIf(!hasGit)('refuses a forbidden path with non-ASCII characters', () => {
      writeFiles(tmp, { 'docs/private/café.md': 'private notes\n' });
      expect(git('init', '-q').status).toBe(0);
      expect(git('add', '-f', 'docs/private/café.md').status).toBe(0);
      const r = runScript(SAFETY, ['--staged'], { cwd: tmp });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('docs/private/café.md: forbidden path');
    });

    it.skipIf(!hasGit)('passes a clean staged file', () => {
      writeFiles(tmp, { 'notes/readme.md': 'Nothing secret here.\n' });
      expect(git('init', '-q').status).toBe(0);
      expect(git('add', 'notes/readme.md').status).toBe(0);
      const r = runScript(SAFETY, ['--staged'], { cwd: tmp });
      expect(r.status, r.output).toBe(0);
      expect(r.stdout).toContain('public-safety: ok (staged files)');
    });
  });
});

describe('deploy', () => {
  // Only the argument check is tested: a valid target runs the real pipeline and deploys, so no case here starts
  // with one.
  it.each([[[]], [['staging']], [['Production']], [['--env', 'preview']]])('exits 1 with usage for %j', (args) => {
    const r = runScript('scripts/deploy.mjs', args);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Usage: node scripts/deploy.mjs <preview|production>');
    expect(r.stdout).not.toContain('deploy: ');
  });

  // A production deploy refuses another branch or a dirty tree before any step runs. The script is copied into a
  // temp repository, so its root holds no other script and nothing could deploy even if the guard were missing.
  describe.skipIf(spawnSync('git', ['--version']).status !== 0)('production guard', () => {
    let tmp;
    beforeEach(() => {
      tmp = makeTempTree();
      writeFiles(tmp, { 'scripts/deploy.mjs': readFileSync(path.join(REPO, 'scripts', 'deploy.mjs'), 'utf8') });
    });
    afterEach(() => {
      removeTree(tmp);
    });
    const deployProduction = () =>
      spawnSync(process.execPath, [path.join(tmp, 'scripts', 'deploy.mjs'), 'production'], {
        cwd: tmp,
        encoding: 'utf8',
      });

    it('refuses a branch other than main', () => {
      expect(spawnSync('git', ['init', '-q', '-b', 'feature'], { cwd: tmp }).status).toBe(0);
      const r = deployProduction();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('production deploys only from main (current branch: feature)');
      expect(r.stdout).not.toContain('deploy: ');
    });

    it('refuses uncommitted changes on main', () => {
      expect(spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: tmp }).status).toBe(0);
      const r = deployProduction();
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('uncommitted changes');
      expect(r.stdout).not.toContain('deploy: ');
    });
  });
});
