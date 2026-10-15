// The token contract (docs/DESIGN_SYSTEM.md section 1) and its accessibility floor, checked from the CSS itself:
// every token exists, the two dark blocks agree, WCAG contrast holds in both schemes, reduced motion wins, and
// the era themes stay token-only so TASK-002 cannot reach into components.
import { describe, expect, test } from 'vitest';
import { ERA_THEMES } from '../../src/lib/era';
import { type CssRule, customProperties, parseRules } from './css';
import { readCssFiles } from './read-css.mjs';

const STYLES = readCssFiles('src/styles');

function readStyle(path: string): string {
  const css = STYLES[path];
  if (css === undefined) throw new Error(`${path} not found`);
  return css;
}

// Mirrors docs/DESIGN_SYSTEM.md section 1; a new token is added there first, then here.
const COLOR_TOKENS = [
  'bg',
  'bg-elevated',
  'surface',
  'surface-hover',
  'text',
  'text-muted',
  'text-inverse',
  'accent',
  'accent-contrast',
  'border',
  'focus',
  'state-ok',
  'state-warn',
  'state-alarm',
].map((name) => `--color-${name}`);
const SHADOW_TOKENS = ['--shadow-sm', '--shadow-md', '--shadow-stage'];
const MOTION_TOKENS = [
  '--motion-fast',
  '--motion-base',
  '--motion-slow',
  '--motion-stage',
  '--motion-ease',
  '--motion-ease-stage',
];
const CONTRACT_TOKENS = [
  ...COLOR_TOKENS,
  '--font-display',
  '--font-body',
  '--font-mono',
  '--font-numeric',
  ...['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'].map((size) => `--text-${size}`),
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--border-width',
  ...SHADOW_TOKENS,
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((step) => `--space-${step}`),
  ...MOTION_TOKENS,
  '--stage-perspective',
  '--stage-gap',
  '--stage-tilt',
  '--stage-scale-side',
  '--stage-item-width',
  '--stage-pitch',
  '--stage-depth',
];

const DARK_MEDIA = '@media (prefers-color-scheme: dark)';

function findRule(rules: CssRule[], selector: string, atRules: string[]): CssRule {
  const matches = rules.filter(
    (rule) => rule.selectors.length === 1 && rule.selectors[0] === selector && rule.atRules.join() === atRules.join(),
  );
  if (matches.length !== 1) throw new Error(`expected one "${selector}" rule in [${atRules}], found ${matches.length}`);
  return matches[0] as CssRule;
}

const tokenRules = parseRules(readStyle('/src/styles/tokens.css'));
const light = customProperties(findRule(tokenRules, ':root', []));
const darkPreferred = customProperties(findRule(tokenRules, ':root:not([data-theme="light"])', [DARK_MEDIA]));
const darkForced = customProperties(findRule(tokenRules, ':root[data-theme="dark"]', []));

describe('tokens.css', () => {
  test('the light :root block defines every contract token', () => {
    const missing = CONTRACT_TOKENS.filter((token) => !light.has(token));
    expect(missing).toEqual([]);
  });

  test('colors are #rrggbb so contrast can be computed', () => {
    for (const [scheme, tokens] of [
      ['light', light],
      ['dark', darkForced],
    ] as const) {
      for (const token of COLOR_TOKENS) expect(tokens.get(token), `${scheme} ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('both dark blocks define every color and shadow token', () => {
    const required = [...COLOR_TOKENS, ...SHADOW_TOKENS];
    expect(required.filter((token) => !darkPreferred.has(token))).toEqual([]);
    expect(required.filter((token) => !darkForced.has(token))).toEqual([]);
  });

  test('the OS dark block and the forced dark block are identical', () => {
    expect(Object.fromEntries(darkPreferred)).toEqual(Object.fromEntries(darkForced));
  });
});

/** sRGB `#rrggbb` to linear-light channels. */
function linearRgb(hex: string): [number, number, number] {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => {
    const c = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return [r, g, b];
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type Lab = [number, number, number];

/** CIE L*a*b* under D65. */
function lab(hex: string): Lab {
  const [r, g, b] = linearRgb(hex);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// CIEDE2000 color difference (Sharma, Wu and Dalal 2005).
function deltaE2000([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const deg = Math.PI / 180;
  const pow7 = (x: number) => x ** 7;
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(pow7(cBar) / (pow7(cBar) + pow7(25))));
  const [a1p, a2p] = [(1 + g) * a1, (1 + g) * a2];
  const [c1p, c2p] = [Math.hypot(a1p, b1), Math.hypot(a2p, b2)];
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / deg + 360) % 360);
  const [h1p, h2p] = [hue(b1, a1p), hue(b2, a2p)];
  const chromatic = c1p * c2p !== 0;
  let dh = chromatic ? h2p - h1p : 0;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin((dh / 2) * deg);
  const lBar = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1p + h2p;
  if (chromatic) hBar = Math.abs(h1p - h2p) > 180 ? (hBar + (hBar < 360 ? 360 : -360)) / 2 : hBar / 2;
  const t =
    1 -
    0.17 * Math.cos((hBar - 30) * deg) +
    0.24 * Math.cos(2 * hBar * deg) +
    0.32 * Math.cos((3 * hBar + 6) * deg) -
    0.2 * Math.cos((4 * hBar - 63) * deg);
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * t;
  const rT =
    -Math.sin(2 * 30 * Math.exp(-(((hBar - 275) / 25) ** 2)) * deg) *
    2 *
    Math.sqrt(pow7(cBarP) / (pow7(cBarP) + pow7(25)));
  const [dl, dc, dhs] = [(l2 - l1) / sL, (c2p - c1p) / sC, dH / sH];
  return Math.sqrt(dl ** 2 + dc ** 2 + dhs ** 2 + rT * dc * dhs);
}

// Reference pairs from Sharma, Wu and Dalal's CIEDE2000 test data: 11 and 15 take the hue-wrap branches, 7 and 33 are
// near-achromatic, 17 is a large difference.
test.each([
  [1, [50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [7, [50, 0, 0], [50, -1, 2], 2.3669],
  [11, [50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
  [15, [50, -0.001, 2.49], [50, 0.0011, -2.49], 4.7461],
  [17, [50, 2.5, 0], [73, 25, -18], 27.1492],
  [29, [22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  [33, [2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
] as [number, Lab, Lab, number][])('CIEDE2000 matches reference pair %i', (_pair, first, second, expected) => {
  expect(deltaE2000(first, second)).toBeCloseTo(expected, 4);
  expect(deltaE2000(second, first)).toBeCloseTo(expected, 4);
});

// Accent, focus ring and body text never read as a machine state: each stays at least this far (CIEDE2000) from every
// state color, in every theme and scheme, so "color means state" holds in every era (docs/DESIGN_SYSTEM.md section 2).
// 10 is a design floor: around 5 the difference is still visible side by side, but too small to carry meaning.
const STATE_DISTANCE = 10;

function stateLookalikes(tokens: Map<string, string>): string[] {
  return ['accent', 'focus', 'text'].flatMap((name) =>
    ['state-ok', 'state-warn', 'state-alarm'].flatMap((state) => {
      const distance = deltaE2000(lab(tokens.get(`--color-${name}`) ?? ''), lab(tokens.get(`--color-${state}`) ?? ''));
      return distance >= STATE_DISTANCE ? [] : [`--color-${name} vs --color-${state}: ${distance.toFixed(1)}`];
    }),
  );
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

// [foreground, background, minimum ratio]: AAA for body text, AA for secondary text and links, 3:1 for the
// focus ring and the state indicators (non-text contrast).
const CONTRAST_PAIRS: [string, string, number][] = [
  ['text', 'bg', 7],
  ['text', 'bg-elevated', 7],
  ['text', 'surface', 7],
  ['text', 'surface-hover', 7],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'bg-elevated', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'surface-hover', 4.5],
  ['accent-contrast', 'accent', 4.5],
  ['text-inverse', 'text', 4.5],
  ['accent', 'bg', 4.5],
  ['accent', 'surface', 4.5],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  // The header background: the focus ring of every header control (Era style switch, language links) sits on it.
  ['focus', 'bg-elevated', 3],
  ['state-ok', 'bg', 3],
  ['state-warn', 'bg', 3],
  ['state-alarm', 'bg', 3],
];

const SCHEMES = {
  light,
  dark: new Map([...light, ...darkForced]),
};

describe.each(Object.entries(SCHEMES))('contrast in the %s scheme', (_scheme, tokens) => {
  test.each(CONTRAST_PAIRS)('--color-%s on --color-%s is at least %s:1', (foreground, background, minimum) => {
    const fg = tokens.get(`--color-${foreground}`);
    const bg = tokens.get(`--color-${background}`);
    if (fg === undefined || bg === undefined) throw new Error('missing color token');
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(minimum);
  });

  test(`accent, focus and text stay ${STATE_DISTANCE} CIEDE2000 from every state color`, () => {
    expect(stateLookalikes(tokens)).toEqual([]);
  });
});

describe('motion.css', () => {
  const rules = parseRules(readStyle('/src/styles/motion.css'));

  test('ends with the reduced-motion block that makes stage moves instant', () => {
    const last = rules.at(-1);
    expect(last?.atRules).toEqual(['@media (prefers-reduced-motion: reduce)']);
    expect(last?.selectors).toEqual([':root', ':root[data-era]']);
    expect(last?.declarations.get('--motion-stage')).toBe('0ms');
  });

  test('declares motion tokens only (no global animation kill switch)', () => {
    const others = rules.flatMap((rule) =>
      [...rule.declarations.keys()].filter((name) => !MOTION_TOKENS.includes(name)),
    );
    expect(others).toEqual([]);
  });
});

describe('era themes', () => {
  test('there is exactly one theme file per era', () => {
    const files = Object.keys(STYLES)
      .filter((path) => path.startsWith('/src/styles/themes/'))
      .sort();
    expect(files).toEqual(ERA_THEMES.map((era) => `/src/styles/themes/${era}.css`).sort());
  });

  // Decoration sits behind the content (negative z-index), above html's background: a body background would hide it.
  test('only html paints the page background', () => {
    const bodyBackgrounds = parseRules(readStyle('/src/styles/global.css'))
      .filter((rule) => rule.selectors.includes('body'))
      .flatMap((rule) => [...rule.declarations.keys()].filter((name) => name.startsWith('background')));
    expect(bodyBackgrounds).toEqual([]);
  });

  // Tokens a theme may set: the contract minus motion, which lives in motion.css so reduced motion still wins, and
  // minus the stage geometry, which stays the museum's so the stage never moves again when Era UI switches the era.
  const THEMEABLE = CONTRACT_TOKENS.filter((token) => !MOTION_TOKENS.includes(token) && !token.startsWith('--stage-'));
  const DECORATION_GUARD = '@media (prefers-reduced-motion: no-preference) and (prefers-contrast: no-preference)';
  const normalized = (value: string | undefined) => value?.toLowerCase().replace(/\s+/g, ' ').trim();

  describe.each(ERA_THEMES)('%s.css', (era) => {
    const rules = parseRules(readStyle(`/src/styles/themes/${era}.css`));
    const base = `html[data-era="${era}"]`;
    const tokenSelectors = new Map<string, string[]>([
      [base, []],
      [`${base}:not([data-theme="light"])`, [DARK_MEDIA]],
      [`${base}[data-theme="dark"]`, []],
    ]);
    const declared = (selector: string) =>
      new Map(
        rules.filter((rule) => rule.selectors.join() === selector).flatMap((rule) => [...customProperties(rule)]),
      );
    const eraLight = declared(base);
    const eraDark = declared(`${base}[data-theme="dark"]`);
    // Era themes are unlayered, so an era's light values also apply in dark mode unless its dark block overrides
    // them; the effective palette per scheme is the museum one with the era layered on top.
    const effective = {
      light: new Map([...light, ...eraLight]),
      dark: new Map([...light, ...darkForced, ...eraLight, ...eraDark]),
    };

    test(`has exactly one light ${base} block`, () => {
      const lightBlocks = rules.filter((rule) => rule.selectors.join() === base && rule.atRules.length === 0);
      expect(lightBlocks).toHaveLength(1);
    });

    test('targets its own era only, never an element or component class', () => {
      for (const rule of rules) {
        expect(rule.body.includes('{'), `nested rule in ${rule.selectors.join()}`).toBe(false);
        for (const selector of rule.selectors) {
          const decoration = selector === `${base} body::before`;
          expect(tokenSelectors.has(selector) || decoration, `unexpected selector "${selector}"`).toBe(true);
          if (decoration)
            expect(rule.atRules, `${selector} needs the motion and contrast guard`).toContain(DECORATION_GUARD);
          const expectedAtRules = tokenSelectors.get(selector);
          if (expectedAtRules) expect(rule.atRules, `at-rules around "${selector}"`).toEqual(expectedAtRules);
        }
      }
    });

    test('overrides contract tokens only, motion and stage geometry excluded', () => {
      const tokenRulesOfEra = rules.filter((rule) => rule.selectors.some((selector) => tokenSelectors.has(selector)));
      const stray = tokenRulesOfEra.flatMap((rule) =>
        [...rule.declarations.keys()].filter((name) => !THEMEABLE.includes(name)),
      );
      expect(stray).toEqual([]);
    });

    // A declaration that changes nothing in either scheme only freezes a museum value: a later tokens.css change
    // would silently not reach visitors with Era UI on. Dark values are judged first, so when an era repeats its own
    // light value in the dark block, only the dark copy is reported (the light one may be pinning dark mode).
    test('declares nothing the museum theme already provides', () => {
      const museumDark = SCHEMES.dark;
      const same = (a: string | undefined, b: string | undefined) => a !== undefined && normalized(a) === normalized(b);
      const restatedDark = [...eraDark]
        .filter(([token, value]) => same(value, eraLight.get(token) ?? museumDark.get(token)))
        .map(([token]) => token);
      const keptDark = (token: string) => eraDark.has(token) && !restatedDark.includes(token);
      const restatedLight = [...eraLight]
        .filter(
          ([token, value]) => same(value, light.get(token)) && (keptDark(token) || same(value, museumDark.get(token))),
        )
        .map(([token]) => token);
      expect([
        ...restatedLight.map((token) => `${token} (light)`),
        ...restatedDark.map((token) => `${token} (dark)`),
      ]).toEqual([]);
    });

    // The cascade result of every body::before rule, so a later rule may refine an earlier one.
    test('keeps any decoration behind the content', () => {
      const decoration = new Map(
        rules
          .filter((rule) => rule.selectors.includes(`${base} body::before`))
          .flatMap((rule) => [...rule.declarations])
          .map(([name, value]) => [name, value.replace(/\s*!important$/, '')] as const),
      );
      if (decoration.size === 0) return;
      expect(decoration.get('position'), `${base} body::before position`).toBe('fixed');
      expect(Number(decoration.get('z-index')), `${base} body::before z-index`).toBeLessThan(0);
    });

    test.each(['light', 'dark'] as const)('keeps state colors distinct in the %s scheme', (scheme) => {
      expect(stateLookalikes(effective[scheme])).toEqual([]);
    });

    test.each(['light', 'dark'] as const)('keeps the contrast floor in the %s scheme', (scheme) => {
      for (const [token, value] of [...eraLight, ...eraDark]) {
        if (COLOR_TOKENS.includes(token)) expect(value, `${era} ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      const tokens = effective[scheme];
      const failures = CONTRAST_PAIRS.flatMap(([foreground, background, minimum]) => {
        const fg = tokens.get(`--color-${foreground}`) ?? '';
        const bg = tokens.get(`--color-${background}`) ?? '';
        const ratio = contrast(fg, bg);
        return ratio >= minimum
          ? []
          : [`--color-${foreground} on --color-${background}: ${ratio.toFixed(2)} < ${minimum}`];
      });
      expect(failures).toEqual([]);
    });

    test('the two dark selectors carry identical values', () => {
      const darkOf = (selector: string, atRules: string[]) =>
        Object.fromEntries(
          rules
            .filter((rule) => rule.selectors.includes(selector) && rule.atRules.join() === atRules.join())
            .flatMap((rule) => [...customProperties(rule)]),
        );
      expect(darkOf(`${base}:not([data-theme="light"])`, [DARK_MEDIA])).toEqual(
        darkOf(`${base}[data-theme="dark"]`, []),
      );
    });
  });
});
