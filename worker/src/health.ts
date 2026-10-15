// GET /api/health: the build id and date from build.json, which the Astro build writes into dist/ (astro.config.mjs).
// Only those two fields are echoed: no secrets, no bindings besides ASSETS, never the DB.
export interface Health {
  ok: true;
  build: string;
  date: string | null;
}

const UNKNOWN: Health = { ok: true, build: 'unknown', date: null };

// The values are echoed publicly, so only an id-like build (a git sha, or "unknown" outside git) and the exact
// toISOString() shape are accepted; anything else counts as an invalid file.
const BUILD_ID = /^[\w.-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function toHealth(data: unknown): Health {
  if (typeof data !== 'object' || data === null) return UNKNOWN;
  const { build, date } = data as Record<string, unknown>;
  if (typeof build !== 'string' || !BUILD_ID.test(build)) return UNKNOWN;
  if (typeof date !== 'string' || !ISO_DATE.test(date)) return UNKNOWN;
  return { ok: true, build, date };
}

/** Health for the deployment that serves `requestUrl`; a missing or invalid build.json still answers ok. */
export async function readHealth(assets: Pick<Fetcher, 'fetch'>, requestUrl: string): Promise<Health> {
  try {
    // A plain GET whatever the incoming method: a HEAD would give no body to read.
    const response = await assets.fetch(new Request(new URL('/build.json', requestUrl)));
    if (!response.ok) return UNKNOWN;
    return toHealth(await response.json());
  } catch {
    // Unreadable or not JSON: health reports the Worker is up, which it is.
    return UNKNOWN;
  }
}
