#!/usr/bin/env node
// Claude Code PostToolUse hook: when a content file or a site illustration was edited, run the validator.
// Receives the tool call as JSON on stdin. Exit 2 blocks and reports errors back to Claude.
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let data = {};
  try {
    data = JSON.parse(input || '{}');
  } catch {
    process.exit(0);
  }
  const file = String(data?.tool_input?.file_path ?? data?.tool_input?.path ?? '');
  const validated =
    /(^|[\\/])(content[\\/](exhibits|stories|schema|images|glossary\.json)|src[\\/]assets[\\/]illustrations[\\/])/;
  if (!validated.test(file)) process.exit(0);
  const r = spawnSync(process.execPath, ['scripts/validate-content.mjs', '--quiet'], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    console.error(`Content validation failed after editing ${file}. Fix the errors above before continuing.`);
    process.exit(2);
  }
  process.exit(0);
});
