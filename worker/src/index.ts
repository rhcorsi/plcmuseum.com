// The Worker in front of the static site (docs/ARCHITECTURE.md section 7). Phase 0 surface: the "/" language
// redirect, GET /api/health and the assets; every other /api path is 404 until POST /api/stories lands in Phase 3
// (worker/README.md). Nothing is logged: no bodies, headers or IPs (docs/SECURITY.md 3.2).
import { readHealth } from './health';
import { negotiateLanguage } from './language';
import { withSecurityHeaders } from './security-headers';

/** The bindings this Worker reads. DB stays out until Phase 3, so no route can reach it by accident. */
export interface Bindings {
  ASSETS: Pick<Fetcher, 'fetch'>;
}

const READ_METHODS = 'GET, HEAD';

function isRead(request: Request): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}

function json(request: Request, status: number, data: unknown, headers: Record<string, string> = {}): Response {
  // HEAD answers with the status and headers of GET, without the body.
  const body = request.method === 'HEAD' ? null : JSON.stringify(data);
  return new Response(body, { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: READ_METHODS } });
}

function languageRedirect(request: Request): Response {
  const lang = negotiateLanguage(request.headers.get('Accept-Language'));
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/${lang}/`,
      // The target depends on the visitor's languages: no shared cache may store one answer for everyone.
      Vary: 'Accept-Language',
      'Cache-Control': 'private, max-age=0',
    },
  });
}

async function route(request: Request, env: Bindings): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health') {
    if (!isRead(request)) return methodNotAllowed();
    return json(request, 200, await readHealth(env.ASSETS, request.url), { 'Cache-Control': 'no-store' });
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) return json(request, 404, { error: 'not_found' });
  if (!isRead(request)) return methodNotAllowed();
  if (pathname === '/') return languageRedirect(request);
  // The binding applies html_handling and not_found_handling (the nearest per-language 404 page).
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
} satisfies ExportedHandler<Env>;
