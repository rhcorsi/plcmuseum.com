import { describe, expect, it } from 'vitest';
import worker, { type Bindings } from '../src/index';
import { SECURITY_HEADERS } from '../src/security-headers';

const ORIGIN = 'https://plcmuseum.com';
const BUILD = { build: '0123456789abcdef0123456789abcdef01234567', date: '2026-10-14T12:00:00.000Z' };

// The assets binding hands back immutable headers; refusing writes here proves the Worker rebuilds the response.
function immutable(response: Response): Response {
  const refuse = (): never => {
    throw new TypeError('immutable headers');
  };
  Object.assign(response.headers, { set: refuse, append: refuse, delete: refuse });
  return response;
}

function page(status: number, lang: string, text: string): Response {
  const html = `<!doctype html><html lang="${lang}"><head><title>${text}</title></head><body>${text}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

type BuildFile = 'present' | 'absent' | 'not-json' | 'wrong-shape' | 'throws';

/** A stand-in for the assets binding over a tiny dist/, recording every request it receives. */
function assets(buildFile: BuildFile = 'present') {
  const requests: Request[] = [];
  const binding: Bindings['ASSETS'] = {
    async fetch(input) {
      const request = new Request(input);
      requests.push(request);
      const { pathname } = new URL(request.url);
      if (pathname === '/build.json') {
        if (buildFile === 'throws') throw new Error('binding unavailable');
        if (buildFile === 'not-json') return immutable(new Response('{"build":', { status: 200 }));
        if (buildFile === 'wrong-shape') {
          return immutable(Response.json({ build: '<script>', date: 'yesterday' }));
        }
        if (buildFile === 'present') return immutable(Response.json({ ...BUILD, extra: 'never echoed' }));
      }
      if (pathname === '/en/') return immutable(page(200, 'en', 'Home'));
      if (pathname === '/_astro/site.css') {
        return immutable(
          new Response('body{}', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'max-age=1' } }),
        );
      }
      // not_found_handling "404-page": the nearest 404.html, in the language of the path.
      return immutable(page(404, pathname.startsWith('/pt/') ? 'pt-BR' : 'en', 'Not found'));
    },
  };
  return { env: { ASSETS: binding } satisfies Bindings, requests };
}

function call(path: string, init: RequestInit = {}, env: Bindings = assets().env): Promise<Response> {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init), env);
}

function expectSecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(response.headers.get(name), name).toBe(value);
}

describe('GET /', () => {
  it.each([
    ['pt-BR,pt;q=0.9,en;q=0.8', '/pt/'],
    ['de-DE', '/de/'],
    ['fr-FR,es;q=0.5', '/es/'],
    ['it-CH', '/it/'],
    ['*', '/en/'],
  ])('redirects Accept-Language %j to %s', async (acceptLanguage, location) => {
    const response = await call('/', { headers: { 'Accept-Language': acceptLanguage } });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(location);
    expect(response.headers.get('Vary')).toBe('Accept-Language');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=0');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expectSecurityHeaders(response);
  });

  it('redirects to English without Accept-Language', async () => {
    const response = await call('/');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/en/');
  });

  it('redirects HEAD the same way, without a body', async () => {
    const response = await call('/', { method: 'HEAD', headers: { 'Accept-Language': 'de' } });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/de/');
    expect(response.body).toBeNull();
  });

  it('never reaches the assets binding', async () => {
    const { env, requests } = assets();
    await call('/', {}, env);
    expect(requests).toHaveLength(0);
  });
});

describe('/api/health', () => {
  it('answers the build id and date from build.json, and nothing else', async () => {
    const response = await call('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, ...BUILD });
    expectSecurityHeaders(response);
  });

  it('reads build.json with a GET through the assets binding', async () => {
    const { env, requests } = assets();
    await call('/api/health', { method: 'HEAD' }, env);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(`${ORIGIN}/build.json`);
  });

  it.each<BuildFile>(['absent', 'not-json', 'wrong-shape', 'throws'])(
    'reports an unknown build when build.json is %s',
    async (buildFile) => {
      const response = await call('/api/health', {}, assets(buildFile).env);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, build: 'unknown', date: null });
      expectSecurityHeaders(response);
    },
  );

  it('answers HEAD with the GET headers and no body', async () => {
    const response = await call('/api/health', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.body).toBeNull();
    expectSecurityHeaders(response);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])('refuses %s with 405', async (method) => {
    const response = await call('/api/health', { method });
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expectSecurityHeaders(response);
  });
});

describe('the rest of /api (404 until Phase 3)', () => {
  it.each([
    ['POST', '/api/stories'],
    ['GET', '/api/stories'],
    ['GET', '/api'],
    ['GET', '/api/'],
    ['GET', '/api/anything'],
    ['DELETE', '/api/anything/deeper'],
    ['GET', '/api/health/'],
  ])('%s %s is a JSON 404', async (method, path) => {
    const { env, requests } = assets();
    const response = await call(path, { method }, env);
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(requests).toHaveLength(0);
    expectSecurityHeaders(response);
  });

  it('answers HEAD with no body', async () => {
    const response = await call('/api/anything', { method: 'HEAD' });
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
  });

  it('does not treat a lookalike path as the API', async () => {
    const response = await call('/apis');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('text/html');
  });
});

describe('static assets', () => {
  it('passes an HTML page through with the security headers', async () => {
    const response = await call('/en/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html lang="en">');
    expectSecurityHeaders(response);
  });

  it('keeps the asset headers and adds the security headers', async () => {
    const response = await call('/_astro/site.css');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/css');
    expect(response.headers.get('Cache-Control')).toBe('max-age=1');
    expectSecurityHeaders(response);
  });

  it('passes the original request to the binding', async () => {
    const { env, requests } = assets();
    await call('/en/', { method: 'HEAD' }, env);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('HEAD');
    expect(requests[0]?.url).toBe(`${ORIGIN}/en/`);
  });

  it('passes the 404 page through with its status and language', async () => {
    const response = await call('/pt/does-not-exist');
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('<html lang="pt-BR">');
    expectSecurityHeaders(response);
  });

  it.each(['POST', 'PUT', 'DELETE'])('refuses %s with 405 before the binding', async (method) => {
    const { env, requests } = assets();
    for (const path of ['/', '/en/', '/does-not-exist']) {
      const response = await call(path, { method }, env);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET, HEAD');
      expectSecurityHeaders(response);
    }
    expect(requests).toHaveLength(0);
  });
});
