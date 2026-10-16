// /prefs.js (public/prefs.js, ADR-0012) runs before first paint as a classic script that no bundler reaches, so it
// repeats the storage keys, the era themes, the languages and the marker of the "/" redirect as literals. Run here
// against stubs of the four browser globals it reads (no DOM library), it must agree with src/islands/contracts.ts,
// src/lib/era.ts, src/i18n/langs.ts and worker/src/language.ts, follow the remembered language only on a language
// home the "/" redirect chose, and stay within its budget of 1 KB gzip.
import { describe, expect, it } from 'vitest';
import SOURCE from '../../public/prefs.js?raw';
import { DECADES } from '../../src/content/schemas';
import { LANGS } from '../../src/i18n/langs';
import { ERA_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';
import { ERA_THEMES, MUSEUM_ERA } from '../../src/lib/era';
// Test-only reach into the Worker: the query its "/" redirect adds to the home it picks.
import { AUTO_QUERY } from '../../worker/src/language';

// The repository's own file, run as the browser runs it, with window, document, location and history bound to the
// stubs: a stray reference to any other global (a bare localStorage, say) throws inside its try/catch, and the
// audit at the end of this file names it.
const runPrefs = new Function('window', 'document', 'location', 'history', SOURCE);

type Visit = {
  path?: string;
  search?: string;
  hash?: string;
  /** localStorage content, or 'blocked' when reading window.localStorage throws (storage disabled). */
  storage?: Record<string, string> | 'blocked';
  pageEra?: string | null;
};

/**
 * Runs /prefs.js once in a stub of the browser globals it reads and reports what it did. `navigated` lists, in order,
 * "stop" for window.stop() and the URL of each location.replace(); `address` is what the address bar shows after
 * every history.replaceState().
 */
function visit({ path = '/en/', search = '', hash = '', storage = {}, pageEra = null }: Visit) {
  const attributes = new Map<string, string>([[ERA_HOOKS.applied, MUSEUM_ERA]]);
  if (pageEra !== null) attributes.set(ERA_HOOKS.page, pageEra);
  const navigated: string[] = [];
  const reads: string[] = [];
  const values = storage === 'blocked' ? null : storage;
  const window = {
    stop: () => navigated.push('stop'),
    get localStorage() {
      if (values === null) throw new Error('SecurityError: storage is disabled');
      return {
        getItem: (key: string) => {
          reads.push(key);
          return values[key] ?? null;
        },
      };
    },
  };
  const document = {
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: unknown) => attributes.set(name, String(value)),
    },
  };
  const location = { pathname: path, search, hash, replace: (url: string) => navigated.push(url) };
  let address = path + search + hash;
  const states: unknown[] = [];
  const history = {
    replaceState: (state: unknown, _unused: string, url: string) => {
      states.push(state);
      address = url;
    },
  };
  runPrefs(window, document, location, history);
  // Checked out here, where the script's try/catch cannot swallow it: only the URL changes, the entry gets no state.
  expect(states.filter((state) => state !== null)).toEqual([]);
  return { era: attributes.get(ERA_HOOKS.applied), navigated, reads, address };
}

const ERA_ON = { [STORAGE_KEYS.eraUi]: '1' };

describe('/prefs.js applies the stored era before first paint', () => {
  it.each(ERA_THEMES)('sets data-era to the page era %s while Era UI is on', (era) => {
    expect(visit({ path: '/en/decades/1980s', storage: ERA_ON, pageEra: era }).era).toBe(era);
  });

  it('accepts exactly the era themes of src/lib/era.ts as page eras', () => {
    const candidates = [...new Set<string>([...ERA_THEMES, ...DECADES, MUSEUM_ERA, '', '1980S', 'x'])];
    const applied = candidates.filter((era) => visit({ storage: ERA_ON, pageEra: era }).era !== MUSEUM_ERA);
    expect(applied.sort()).toEqual([...ERA_THEMES].sort());
  });

  it.each([['0'], ['true'], ['on'], ['']])('keeps the museum theme when the stored value is "%s"', (value) => {
    expect(visit({ storage: { [STORAGE_KEYS.eraUi]: value }, pageEra: '1980s' }).era).toBe(MUSEUM_ERA);
  });

  it('keeps the museum theme with nothing stored, or on a page without data-page-era', () => {
    expect(visit({ pageEra: '1980s' }).era).toBe(MUSEUM_ERA);
    expect(visit({ storage: ERA_ON }).era).toBe(MUSEUM_ERA);
  });

  it('reads no key outside STORAGE_KEYS', () => {
    const { reads } = visit({ storage: { ...ERA_ON, [STORAGE_KEYS.lang]: 'pt' }, pageEra: '1990s' });
    expect(reads).toContain(STORAGE_KEYS.eraUi);
    expect(reads.filter((key) => !Object.values<string>(STORAGE_KEYS).includes(key))).toEqual([]);
  });
});

describe('/prefs.js follows the remembered language only on a home the "/" redirect chose', () => {
  const pairs = LANGS.flatMap((home) => LANGS.filter((lang) => lang !== home).map((lang) => [home, lang] as const));

  it.each(pairs)('stops /%s/ and replaces it with the remembered %s, keeping the fragment', (home, lang) => {
    const result = visit({
      path: `/${home}/`,
      search: AUTO_QUERY,
      hash: '#stage',
      storage: { [STORAGE_KEYS.lang]: lang },
    });
    expect(result.navigated).toEqual(['stop', `/${lang}/#stage`]);
  });

  it('removes the marker from the address bar, whether it follows or not', () => {
    const remembered = visit({ search: AUTO_QUERY, hash: '#stage', storage: { [STORAGE_KEYS.lang]: 'pt' } });
    expect(remembered.address).toBe('/en/#stage');
    expect(visit({ search: AUTO_QUERY }).address).toBe('/en/');
    // Before storage is read: blocked storage still leaves a clean address.
    expect(visit({ search: AUTO_QUERY, storage: 'blocked' }).address).toBe('/en/');
  });

  it('leaves the theme alone once it has replaced the page', () => {
    const storage = { ...ERA_ON, [STORAGE_KEYS.lang]: 'pt' };
    expect(visit({ search: AUTO_QUERY, storage, pageEra: '1980s' }).era).toBe(MUSEUM_ERA);
  });

  it('stays on the home of the remembered language, and still applies the era there', () => {
    const result = visit({
      search: AUTO_QUERY,
      storage: { ...ERA_ON, [STORAGE_KEYS.lang]: 'en' },
      pageEra: '1980s',
    });
    expect(result.navigated).toEqual([]);
    expect(result.era).toBe('1980s');
  });

  // A link (the binding's redirect of /en to /en/ included, which keeps the query of /en), a reload or a history
  // move: none carries the marker, which the first visit removed from its entry.
  it.each(['', '?auto=1', '?ref=post', '?ref=post&auto', '?auto&ref=post', '?AUTO', '?auto/'])(
    'keeps the language and the address of a home whose query is "%s"',
    (search) => {
      const result = visit({ search, storage: { ...ERA_ON, [STORAGE_KEYS.lang]: 'pt' }, pageEra: '1980s' });
      expect(result.navigated).toEqual([]);
      expect(result.address).toBe(`/en/${search}`);
      expect(result.era).toBe('1980s');
    },
  );

  it.each(['/', '/en', '/en/about', '/en/decades/1980s', '/fr/', '/EN/', '/pt-br/'])(
    'never follows on %s, which is not a language home',
    (path) => {
      const result = visit({ path, search: AUTO_QUERY, storage: { [STORAGE_KEYS.lang]: 'pt' } });
      expect(result.navigated).toEqual([]);
      expect(result.address).toBe(path + AUTO_QUERY);
    },
  );

  it.each(['fr', 'PT', 'pt-BR', 'pt/', '//example.org', ''])('ignores the stored value "%s"', (lang) => {
    expect(visit({ search: AUTO_QUERY, storage: { [STORAGE_KEYS.lang]: lang } }).navigated).toEqual([]);
  });

  it('reads the remembered language only on a home the "/" redirect chose', () => {
    const storage = { ...ERA_ON, [STORAGE_KEYS.lang]: 'pt' };
    expect(visit({ storage, pageEra: '1980s' }).reads).toEqual([STORAGE_KEYS.eraUi]);
    expect(visit({ search: AUTO_QUERY, storage, pageEra: '1980s' }).reads).toEqual([STORAGE_KEYS.lang]);
  });
});

describe('/prefs.js never breaks the page', () => {
  it('does nothing and throws nothing when storage is blocked', () => {
    expect(visit({ search: AUTO_QUERY, storage: 'blocked', pageEra: '1980s' })).toEqual({
      era: MUSEUM_ERA,
      navigated: [],
      reads: [],
      address: '/en/',
    });
  });

  it('stays at most 1 KB gzip', async () => {
    const gzipped = new Blob([SOURCE]).stream().pipeThrough(new CompressionStream('gzip'));
    expect((await new Response(gzipped).arrayBuffer()).byteLength).toBeLessThanOrEqual(1024);
  });
});

// The privacy page promises that a remembered choice never leaves the device and that the site sets no cookie
// (privacy.preferences, privacy.lead), and SECURITY.md 3.1 that /prefs.js writes nothing but the address bar. The
// stubs above would accept a cookie write and the script swallows a failing fetch, so here every global is a proxy
// that records what the script touches: it may name no other global, read only these members, assign nothing, and
// give the current history entry no URL but the home it is on.
const ALLOWED_READS = new Set([
  'window.localStorage',
  'window.stop',
  'storage.getItem',
  'document.documentElement',
  'root.getAttribute',
  'root.setAttribute',
  'location.pathname',
  'location.search',
  'location.hash',
  'location.replace',
  'history.replaceState',
]);

function audit(source: string) {
  const globals = new Set<string>();
  const touched = new Set<string>();
  const writes: string[] = [];
  const addresses: unknown[] = [];
  const watch = <T extends object>(name: string, target: T): T =>
    new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string') touched.add(`${name}.${key}`);
        return Reflect.get(object, key, receiver);
      },
      set(object, key, value) {
        writes.push(`${name}.${String(key)}`);
        return Reflect.set(object, key, value);
      },
    });
  const attributes = new Map<string, string>([[ERA_HOOKS.page, '1980s']]);
  const root = watch('root', {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  });
  const storage = watch('storage', {
    getItem: (key: string) => ({ [STORAGE_KEYS.eraUi]: '1', [STORAGE_KEYS.lang]: 'pt' })[key] ?? null,
  });
  // The era path, the follow path, and a marked home that stays (the remembered language is its own), with the era.
  for (const [path, search] of [
    ['/en/decades/1980s', ''],
    ['/en/', AUTO_QUERY],
    ['/pt/', AUTO_QUERY],
  ]) {
    const bound: Record<string, object> = {
      window: watch('window', { localStorage: storage, stop: () => undefined }),
      document: watch('document', { documentElement: root }),
      location: watch('location', { pathname: path, search, hash: '', replace: () => undefined }),
      history: watch('history', { replaceState: (...args: unknown[]) => addresses.push(args) }),
    };
    // Every free identifier of the script resolves through this scope, so a global it was not given (open, top,
    // navigation) is recorded even when the call throws inside the script's own try/catch.
    const scope = new Proxy(bound, {
      has: (_target, key) => typeof key === 'string',
      get(target, key) {
        if (typeof key === 'string' && !(key in target)) globals.add(key);
        return Reflect.get(target, key);
      },
      set(target, key, value) {
        writes.push(`global.${String(key)}`);
        return Reflect.set(target, key, value);
      },
    });
    new Function('scope', `with (scope) {${source}}`)(scope);
  }
  return {
    globals: [...globals].sort(),
    outside: [...touched].filter((member) => !ALLOWED_READS.has(member)).sort(),
    writes,
    addresses,
  };
}

describe('/prefs.js only reads the preferences', () => {
  it('names only its four globals, touches only the allowed members and assigns nothing, on every path', () => {
    expect(audit(SOURCE)).toEqual({
      globals: [],
      outside: [],
      writes: [],
      addresses: [
        [null, '', '/en/'],
        [null, '', '/pt/'],
      ],
    });
  });

  it.each([
    ['a cookie', "document.cookie = 'era=1';"],
    ['a request', "window.fetch('/beacon');"],
    ['a storage write', "store.setItem('x', '1');"],
    ['a beacon', "window.navigator.sendBeacon('/beacon', era);"],
    ['a history entry', "history.pushState(null, '', '/x');"],
    ['a history entry through the Navigation API', "navigation.navigate('/x', { history: 'push' });"],
    ['a new window', "open('https://example.org/?' + era);"],
    ['a navigation of the top window', "top.location = '/x';"],
  ])('fails the audit when the script adds %s', (_name, line) => {
    const tampered = SOURCE.replace(
      "root.setAttribute('data-era', era);",
      `root.setAttribute('data-era', era); ${line}`,
    );
    expect(tampered).not.toBe(SOURCE);
    const result = audit(tampered);
    expect(result.globals.length + result.outside.length + result.writes.length).toBeGreaterThan(0);
  });

  it('names no network, cookie, storage-writing or history-adding API in its source', () => {
    expect(SOURCE).not.toMatch(
      /cookie|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|setItem|removeItem|pushState|navigation\.|import\(/,
    );
  });
});
