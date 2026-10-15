#!/usr/bin/env node
// Owner only, on the owner's machine (docs/WORKFLOW.md section 8): lists pending stories in D1 and approves or
// rejects them by id. Approved stories reach the site on the next deploy through `pnpm stories:fetch`.
// Phase 0 skeleton: arguments are parsed and checked now; the D1 calls (wrangler d1 execute) land in Phase 3.
// The token is only ever tested for presence: never print, log or write it, not even partially.
import { parseArgs } from 'node:util';

const USAGE = `Usage: pnpm stories:moderate <action> [--env preview|production]

Actions (exactly one):
  --list                 print pending stories
  --approve <ids>        approve stories, ids comma separated (st-xxxxxxxx)
  --reject <ids>         reject stories, ids comma separated (st-xxxxxxxx)

Options:
  --env <name>           D1 database to moderate: preview or production (default production)
  --help                 show this text

Needs CLOUDFLARE_API_TOKEN (scoped to D1:Edit) exported in this shell session only.`;

const ID = /^st-[a-z0-9]{8,32}$/;
const ENVS = ['preview', 'production'];

function fail(message) {
  console.error(`stories:moderate: ${message}`);
  process.exit(1);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      list: { type: 'boolean' },
      approve: { type: 'string' },
      reject: { type: 'string' },
      env: { type: 'string', default: 'production' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  }));
} catch (e) {
  fail(`${e.message}\n\n${USAGE}`);
}

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const actions = ['list', 'approve', 'reject'].filter((name) => values[name] !== undefined);
if (actions.length !== 1) fail(`choose exactly one of --list, --approve, --reject.\n\n${USAGE}`);
const action = actions[0];

if (!ENVS.includes(values.env)) fail(`--env must be one of ${ENVS.join(', ')} (got "${values.env}").`);

let ids = [];
if (action !== 'list') {
  ids = values[action]
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) fail(`--${action} needs at least one story id.`);
  const invalid = ids.filter((id) => !ID.test(id));
  if (invalid.length) fail(`invalid story id(s): ${invalid.join(', ')} (expected ${ID.source}).`);
}

if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
  fail(
    [
      'CLOUDFLARE_API_TOKEN is not set.',
      'Export a token scoped to D1:Edit on this account in this shell session only.',
      'Never put it in a file inside this repository (.env, .dev.vars, scripts or notes).',
    ].join('\n'),
  );
}

const target = ids.length ? ` ${ids.join(', ')}` : '';
fail(`--${action}${target} on ${values.env}: moderation through D1 is implemented in Phase 3; nothing was changed.`);
