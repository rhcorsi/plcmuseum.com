import { describe, expect, it } from 'vitest';
import securityDoc from '../../docs/SECURITY.md?raw';
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
