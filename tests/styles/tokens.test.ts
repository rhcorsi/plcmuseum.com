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

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

  // Tokens a theme may set: the contract minus motion, which lives in motion.css so reduced motion still wins.
  const THEMEABLE = CONTRACT_TOKENS.filter((token) => !MOTION_TOKENS.includes(token));
  const DECORATION_GUARD = '@media (prefers-reduced-motion: no-preference) and (prefers-contrast: no-preference)';

  describe.each(ERA_THEMES)('%s.css', (era) => {
    const rules = parseRules(readStyle(`/src/styles/themes/${era}.css`));
    const base = `html[data-era="${era}"]`;
    const tokenSelectors = new Map<string, string[]>([
      [base, []],
      [`${base}:not([data-theme="light"])`, [DARK_MEDIA]],
      [`${base}[data-theme="dark"]`, []],
    ]);

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

    test('overrides contract tokens only, motion excluded', () => {
      const tokenRulesOfEra = rules.filter((rule) => rule.selectors.some((selector) => tokenSelectors.has(selector)));
      const stray = tokenRulesOfEra.flatMap((rule) =>
        [...rule.declarations.keys()].filter((name) => !THEMEABLE.includes(name)),
      );
      expect(stray).toEqual([]);
    });

    // Era themes are unlayered, so an era's light values also apply in dark mode unless its dark block overrides
    // them; the effective palette per scheme is the museum one with the era layered on top.
    test.each(['light', 'dark'] as const)('keeps the contrast floor in the %s scheme', (scheme) => {
      const eraLight = new Map(
        rules
          .filter((rule) => rule.selectors.join() === base && rule.atRules.length === 0)
          .flatMap((rule) => [...customProperties(rule)]),
      );
      const eraDark = new Map(
        rules
          .filter((rule) => rule.selectors.join() === `${base}[data-theme="dark"]`)
          .flatMap((rule) => [...customProperties(rule)]),
      );
      for (const [token, value] of [...eraLight, ...eraDark]) {
        if (COLOR_TOKENS.includes(token)) expect(value, `${era} ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      const tokens =
        scheme === 'light'
          ? new Map([...light, ...eraLight])
          : new Map([...light, ...darkForced, ...eraLight, ...eraDark]);
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
