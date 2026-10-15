// The headers of docs/SECURITY.md 3.1, verbatim. worker/test/security-headers.test.ts compares this list with the
// document, so a change here and a change there travel together or the tests fail.
export const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
} as const satisfies Record<string, string>;

/**
 * The same response with the security headers set, replacing any value it already had. `policy` is the
 * Content-Security-Policy to send: the documented one, plus the build's island hashes once csp.json is read (csp.ts).
 * Responses from the assets binding have immutable headers, so the response is rebuilt rather than modified.
 */
export function withSecurityHeaders(response: Response, policy: string): Response {
  const secured = new Response(response.body, response);
  const headers = { ...SECURITY_HEADERS, 'Content-Security-Policy': policy };
  for (const [name, value] of Object.entries(headers)) secured.headers.set(name, value);
  return secured;
}
