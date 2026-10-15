// The Content-Security-Policy this deployment sends: the policy of docs/SECURITY.md 3.1 plus the hashes of the inline
// scripts and styles Astro emits for islands, which the build lists in csp.json (astro.config.mjs). The hashes only
// ever add sources to script-src and style-src; without a valid csp.json the documented policy goes out unchanged
// (docs/adr/0010-csp-hashes-for-islands.md).
import { SECURITY_HEADERS } from './security-headers';

export const BASE_POLICY: string = SECURITY_HEADERS['Content-Security-Policy'];

/** csp.json: per directive, the hashes (`sha256-...`, unquoted) to allow on top of the documented sources. */
export type InlineHashes = Record<'script-src' | 'style-src', string[]>;

// Anything else (a keyword, a host, a quote or a semicolon) could widen or break the policy, so it is refused.
const HASH = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

function isHashList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((hash) => typeof hash === 'string' && HASH.test(hash));
}

function toHashes(data: unknown): InlineHashes | null {
  if (typeof data !== 'object' || data === null) return null;
  const { 'script-src': scripts, 'style-src': styles } = data as Record<string, unknown>;
  return isHashList(scripts) && isHashList(styles) ? { 'script-src': scripts, 'style-src': styles } : null;
}

/** The documented policy with each hash appended, quoted, to its own directive. */
export function policyWithHashes(hashes: InlineHashes): string {
  return BASE_POLICY.split('; ')
    .map((directive) => {
      const name = directive.split(' ', 1)[0];
      const added = name === 'script-src' || name === 'style-src' ? hashes[name] : [];
      return [directive, ...added.map((hash) => `'${hash}'`)].join(' ');
    })
    .join('; ');
}

/** The policy for the deployment that serves `requestUrl`, or null while csp.json is missing, invalid or unreadable. */
export async function readPolicy(assets: Pick<Fetcher, 'fetch'>, requestUrl: string): Promise<string | null> {
  try {
    const response = await assets.fetch(new Request(new URL('/csp.json', requestUrl)));
    if (!response.ok) return null;
    const hashes = toHashes(await response.json());
    return hashes && policyWithHashes(hashes);
  } catch {
    return null;
  }
}
