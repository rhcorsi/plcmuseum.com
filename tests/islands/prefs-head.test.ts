// /prefs.js (public/prefs.js, ADR-0012) runs before first paint as a classic script that no bundler reaches, so it
// repeats the storage keys, the era themes and the languages as literals. Run here against stubs of the four browser
// globals it reads (no DOM library), it must agree with src/islands/contracts.ts, src/lib/era.ts and
// src/i18n/langs.ts, follow the remembered language only on a language home reached through a redirect, and stay
// within its budget of 1 KB gzip.
import { describe, expect, it } from 'vitest';
import SOURCE from '../../public/prefs.js?raw';
import { DECADES } from '../../src/content/schemas';
import { LANGS } from '../../src/i18n/langs';
import { ERA_HOOKS, STORAGE_KEYS } from '../../src/islands/contracts';
import { ERA_THEMES, MUSEUM_ERA } from '../../src/lib/era';

// The repository's own file, run as the browser runs it, with window, document, location and performance bound to
// the stubs: a stray reference to any other global (a bare localStorage, say) throws inside its try/catch, and the
// assertions fail.
const runPrefs = new Function('window', 'document', 'location', 'performance', SOURCE);
const REDIRECTED = { type: 'navigate', redirectCount: 1 };

type Visit = {
  path?: string;
  search?: string;
  hash?: string;
  /** localStorage content, or 'blocked' when reading window.localStorage throws (storage disabled). */
  storage?: Record<string, string> | 'blocked';
  /** The PerformanceNavigationTiming entry, or null when the browser has none. */
  navigation?: { type: string; redirectCount: number } | null;
  pageEra?: string | null;
};

/**
 * Runs /prefs.js once in a stub of the browser globals it reads and reports what it did. `navigated` lists, in order,
 * "stop" for window.stop() and the URL of each location.replace().
 */
function visit({ path = '/en/', search = '', hash = '', storage = {}, navigation = null, pageEra = null }: Visit) {
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
  const performance = {
    getEntriesByType: (type: string) => (type === 'navigation' && navigation ? [navigation] : []),
  };
  runPrefs(window, document, location, performance);
  return { era: attributes.get(ERA_HOOKS.applied), navigated, reads };
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

describe('/prefs.js follows the remembered language on a redirected home', () => {
  const pairs = LANGS.flatMap((home) => LANGS.filter((lang) => lang !== home).map((lang) => [home, lang] as const));

  it.each(pairs)('stops /%s/ and replaces it with the remembered %s, keeping query and fragment', (home, lang) => {
    const result = visit({
      path: `/${home}/`,
      search: '?ref=post',
      hash: '#stage',
      storage: { [STORAGE_KEYS.lang]: lang },
      navigation: REDIRECTED,
    });
    expect(result.navigated).toEqual(['stop', `/${lang}/?ref=post#stage`]);
  });

  it('leaves the theme alone once it has replaced the page', () => {
    const storage = { ...ERA_ON, [STORAGE_KEYS.lang]: 'pt' };
    expect(visit({ storage, navigation: REDIRECTED, pageEra: '1980s' }).era).toBe(MUSEUM_ERA);
  });

  it('stays on the home of the remembered language, and still applies the era there', () => {
    const result = visit({
      storage: { ...ERA_ON, [STORAGE_KEYS.lang]: 'en' },
      navigation: REDIRECTED,
      pageEra: '1980s',
    });
    expect(result.navigated).toEqual([]);
    expect(result.era).toBe('1980s');
  });

  it.each([
    ['a navigation without redirect', { type: 'navigate', redirectCount: 0 }],
    ['a reload', { type: 'reload', redirectCount: 1 }],
    ['a history move', { type: 'back_forward', redirectCount: 1 }],
    ['a browser without Navigation Timing', null],
  ])('does nothing after %s', (_name, navigation) => {
    expect(visit({ storage: { [STORAGE_KEYS.lang]: 'pt' }, navigation }).navigated).toEqual([]);
  });

  it.each(['/', '/en', '/en/about', '/en/decades/1980s', '/fr/', '/EN/', '/pt-br/'])(
    'never follows on %s, which is not a language home',
    (path) => {
      expect(visit({ path, storage: { [STORAGE_KEYS.lang]: 'pt' }, navigation: REDIRECTED }).navigated).toEqual([]);
    },
  );

  it.each(['fr', 'PT', 'pt-BR', 'pt/', '//example.org', ''])('ignores the stored value "%s"', (lang) => {
    expect(visit({ storage: { [STORAGE_KEYS.lang]: lang }, navigation: REDIRECTED }).navigated).toEqual([]);
  });
});

describe('/prefs.js never breaks the page', () => {
  it('does nothing and throws nothing when storage is blocked', () => {
    expect(visit({ storage: 'blocked', navigation: REDIRECTED, pageEra: '1980s' })).toEqual({
      era: MUSEUM_ERA,
      navigated: [],
      reads: [],
    });
  });

  it('stays at most 1 KB gzip', async () => {
    const gzipped = new Blob([SOURCE]).stream().pipeThrough(new CompressionStream('gzip'));
    expect((await new Response(gzipped).arrayBuffer()).byteLength).toBeLessThanOrEqual(1024);
  });
});

// The privacy page promises that a remembered choice never leaves the device and that the site sets no cookie
// (privacy.preferences, privacy.lead), and SECURITY.md 3.1 that /prefs.js only reads storage. The stubs above would
// accept a cookie write and the script swallows a failing fetch, so here every global is a proxy that records what
// the script touches: it may read only these members and write nothing.
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
  'performance.getEntriesByType',
  'entry.type',
  'entry.redirectCount',
]);

function audit(source: string) {
  const touched = new Set<string>();
  const writes: string[] = [];
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
  const entry = watch('entry', { type: 'navigate', redirectCount: 1 });
  for (const path of ['/en/decades/1980s', '/en/']) {
    const run = new Function('window', 'document', 'location', 'performance', source);
    run(
      watch('window', { localStorage: storage, stop: () => undefined }),
      watch('document', { documentElement: root }),
      watch('location', { pathname: path, search: '', hash: '', replace: () => undefined }),
      watch('performance', { getEntriesByType: () => [entry] }),
    );
  }
  return { outside: [...touched].filter((member) => !ALLOWED_READS.has(member)).sort(), writes };
}

describe('/prefs.js only reads the preferences', () => {
  it('touches only the allowed members and assigns nothing, on the era path and on the follow path', () => {
    expect(audit(SOURCE)).toEqual({ outside: [], writes: [] });
  });

  it.each([
    ['a cookie', "document.cookie = 'era=1';"],
    ['a request', "window.fetch('/beacon');"],
    ['a storage write', "store.setItem('x', '1');"],
    ['a beacon', "window.navigator.sendBeacon('/beacon', era);"],
  ])('fails the audit when the script adds %s', (_name, line) => {
    const tampered = SOURCE.replace(
      "root.setAttribute('data-era', era);",
      `root.setAttribute('data-era', era); ${line}`,
    );
    expect(tampered).not.toBe(SOURCE);
    const result = audit(tampered);
    expect(result.outside.length + result.writes.length).toBeGreaterThan(0);
  });

  it('names no network, cookie or storage-writing API in its source', () => {
    expect(SOURCE).not.toMatch(
      /cookie|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|setItem|removeItem|import\(/,
    );
  });
});
