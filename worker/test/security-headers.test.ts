import { describe, expect, it } from 'vitest';
import securityDoc from '../../docs/SECURITY.md?raw';
import { BASE_POLICY, policyWithHashes } from '../src/csp';
import { SECURITY_HEADERS } from '../src/security-headers';

// Every `Name: value` code span in docs/SECURITY.md section 3.1 is a header the Worker must send.
function documentedHeaders(): Record<string, string> {
  const start = securityDoc.indexOf('### 3.1');
  const end = securityDoc.indexOf('### 3.2');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const section = securityDoc.slice(start, end);
  return Object.fromEntries(
    [...section.matchAll(/`([A-Z][A-Za-z-]+): ([^`]+)`/g)].map(([, name, value]) => [name, value]),
  );
}

describe('SECURITY_HEADERS', () => {
  it('is exactly the list in docs/SECURITY.md 3.1', () => {
    expect(SECURITY_HEADERS).toEqual(documentedHeaders());
  });

  it('carries the Content-Security-Policy string verbatim', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe(documentedHeaders()['Content-Security-Policy']);
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(6);
  });
});

const HASH_SOURCE = /^'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'$/;

function withoutHashSources(policy: string): string {
  return policy
    .split('; ')
    .map((directive) =>
      directive
        .split(' ')
        .filter((source) => !HASH_SOURCE.test(source))
        .join(' '),
    )
    .join('; ');
}

/** Directive name to its hash sources, for the directives that have any. */
function hashSources(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split('; ')
      .map((directive) => directive.split(' '))
      .map(([name, ...sources]) => [name, sources.filter((source) => HASH_SOURCE.test(source))] as const)
      .filter(([, hashes]) => hashes.length > 0),
  );
}

// docs/adr/0010-csp-hashes-for-islands.md: the Worker sends the documented policy plus the island hashes of csp.json.
describe('the policy with build-time hashes', () => {
  it('starts from the documented policy', () => {
    expect(BASE_POLICY).toBe(documentedHeaders()['Content-Security-Policy']);
    expect(policyWithHashes({ 'script-src': [], 'style-src': [] })).toBe(BASE_POLICY);
  });

  it('only adds the hashes, quoted, to script-src and style-src', () => {
    const policy = policyWithHashes({ 'script-src': ['sha256-YQ==', 'sha512-Yg=='], 'style-src': ['sha384-Yw=='] });
    expect(withoutHashSources(policy)).toBe(documentedHeaders()['Content-Security-Policy']);
    expect(hashSources(policy)).toEqual({
      'script-src': ["'sha256-YQ=='", "'sha512-Yg=='"],
      'style-src': ["'sha384-Yw=='"],
    });
  });
});
