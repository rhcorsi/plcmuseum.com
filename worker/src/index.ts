// The Worker in front of the static site (docs/ARCHITECTURE.md section 7). Phase 0 surface: the "/" language
// redirect, GET /api/health and the assets (the content-hashed ones cached for a year); every other /api path is 404
// until POST /api/stories lands in Phase 3 (worker/README.md). Nothing is logged: no bodies, headers or IPs
// (docs/SECURITY.md 3.2).
import { BASE_POLICY, readPolicy } from './csp';
import { readHealth } from './health';
import { AUTO_QUERY, negotiateLanguage } from './language';
import { withSecurityHeaders } from './security-headers';

/** The bindings this Worker reads. DB stays out until Phase 3, so no route can reach it by accident. */
export interface Bindings {
  ASSETS: Pick<Fetcher, 'fetch'>;
}

const READ_METHODS = 'GET, HEAD';
// Every file under /_astro/ has a hash of its content in its name: Vite names its output that way, and the build
// gives /prefs.js one too (astro.config.mjs). A deploy that changes a file changes its URL, so browsers may keep these
// for a year without asking again. Everything else, HTML pages above all, keeps the binding's revalidating default.
// Private: Cloudflare does not cache Worker responses anyway, and no other shared cache may keep preview's files
// (behind Cloudflare Access) and serve them to anyone else.
const HASHED_ASSETS = '/_astro/';
const IMMUTABLE = 'private, max-age=31536000, immutable';

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
      // The marker tells /prefs.js that this home was chosen for the visitor rather than asked for.
      Location: `/${lang}/${AUTO_QUERY}`,
      // The target depends on the visitor's languages: no shared cache may store one answer for everyone.
      Vary: 'Accept-Language',
      'Cache-Control': 'private, max-age=0',
    },
  });
}

async function serveAsset(request: Request, env: Bindings, pathname: string): Promise<Response> {
  // The binding applies html_handling and not_found_handling (the nearest per-language 404 page).
  if (!pathname.startsWith(HASHED_ASSETS)) return env.ASSETS.fetch(request);
  // The binding answers a matching If-None-Match with a 304 before it looks at what it would serve, its 404 page
  // included, so a 304 here may stand for a missing file. Asked without validators it answers the file (200) or the
  // 404 page, and only the file becomes immutable. A copy stored before this header existed is fetched once more.
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const response = await env.ASSETS.fetch(new Request(request, { headers }));
  if (response.status !== 200) return response;
  // The binding's headers are immutable, so the response is rebuilt, as withSecurityHeaders does.
  const cached = new Response(response.body, response);
  cached.headers.set('Cache-Control', IMMUTABLE);
  return cached;
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
  return serveAsset(request, env, pathname);
}

/**
 * The fetch handler and its one piece of state: the Content-Security-Policy built from csp.json. It is read on the
 * first request that finds a valid file and kept for the life of the isolate (csp.json changes only with a deploy,
 * which starts new isolates); until then every response carries the documented policy.
 */
export function createWorker() {
  let policy: string | null = null;
  return {
    async fetch(request: Request, env: Bindings): Promise<Response> {
      policy ??= await readPolicy(env.ASSETS, request.url);
      return withSecurityHeaders(await route(request, env), policy ?? BASE_POLICY);
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
