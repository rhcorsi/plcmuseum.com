// Guard for "design tokens only" (CLAUDE.md rule 7) and the CSP (style-src 'self'): outside the token and theme
// files, src/ never hardcodes a color or a font family and never writes a style attribute. Color names used as
// CSS values (red, white) are out of scope; the guard looks for literal notations only.
import { expect, test } from 'vitest';
import { blankComments } from './css';
import { readCssFiles } from './read-css.mjs';

const SOURCES: Record<string, string> = {
  ...import.meta.glob<string>('/src/**/*.{astro,tsx,ts}', { query: '?raw', import: 'default', eager: true }),
  // CSS cannot come through import.meta.glob: Vitest empties every .css module (see read-css.mjs).
  ...readCssFiles('src'),
};

// Where literal values are the point: the token definitions, the era themes, the Tailwind bridge, and fixtures
// (fictional data, including placeholder SVG images).
const EXEMPT = ['/src/styles/tokens.css', '/src/styles/motion.css', '/src/styles/global.css'];
const EXEMPT_DIRS = ['/src/styles/themes/', '/src/fixtures/'];

const HEX = String.raw`#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])`;
const COLOR_FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
// Outside CSS a "#..." is often a URL fragment, and "#decade" is valid hex, so hex only counts where a color is
// expected: a Tailwind arbitrary value, an SVG paint attribute, or a color-like key in a style object.
const HEX_IN_MARKUP = new RegExp(
  [
    String.raw`\[[^\]\s'"]*${HEX}`,
    String.raw`\b(?:fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor)\s*=\s*\{?\s*['"\x60]\s*${HEX}`,
    String.raw`[\w-]*(?:color|background|fill|stroke|border|outline|shadow)[\w-]*['"]?\s*:\s*['"\x60][^'"\x60]*${HEX}`,
  ].join('|'),
  'gi',
);
const CSS_DECLARATION = /(?<=^|[{;])\s*([a-zA-Z-]+)\s*:([^;{}]*)/g;
const FONT_FAMILY_OK = /^(?:var\(--font-[\w-]+\)|inherit|initial|unset|revert|revert-layer)(?:\s*!important)?$/;
const CSS_WIDE = /^(?:inherit|initial|unset|revert|revert-layer)$/;

type Finding = { index: number; rule: string; snippet: string };

function scanCss(css: string, offset: number): Finding[] {
  const findings: Finding[] = [];
  for (const match of css.matchAll(CSS_DECLARATION)) {
    const property = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();
    const index = offset + match.index;
    if (new RegExp(HEX, 'i').test(value) || new RegExp(COLOR_FUNCTION.source, 'i').test(value)) {
      findings.push({ index, rule: 'color literal (use a --color-* token)', snippet: `${property}: ${value}` });
    }
    if (property === 'font-family' && !FONT_FAMILY_OK.test(value)) {
      findings.push({ index, rule: 'literal font-family (use a --font-* token)', snippet: `${property}: ${value}` });
    }
    if (property === 'font' && !CSS_WIDE.test(value) && !value.includes('var(--font-')) {
      findings.push({ index, rule: 'font shorthand without a --font-* token', snippet: `${property}: ${value}` });
    }
  }
  return findings;
}

function scanMarkup(source: string, path: string): Finding[] {
  const findings: Finding[] = [];
  const add = (pattern: RegExp, rule: string) => {
    for (const match of source.matchAll(pattern)) findings.push({ index: match.index, rule, snippet: match[0] });
  };
  add(new RegExp(COLOR_FUNCTION.source, 'gi'), 'color literal (use a --color-* token)');
  add(HEX_IN_MARKUP, 'color literal (use a --color-* token)');
  add(/\bfont-\[(?![\d.]|[^\]]*var\(--)[^\]]*\]/g, 'literal font in a Tailwind arbitrary value');
  add(/\bfontFamily\s*:\s*['"\x60]/g, 'literal fontFamily');
  add(/\bsetAttribute\(\s*['"]style['"]/g, 'style attribute (CSP style-src self)');
  if (path.endsWith('.ts')) return findings;
  // The CSP refuses style attributes, including the ones React and Astro render from a style prop. Prettier never
  // spaces an attribute's "=", which tells `style={...}` apart from a `const style = {...}` variable.
  add(/(?<![\w:.$-])style=["'{]/g, 'style attribute (CSP style-src self)');
  if (path.endsWith('.astro')) {
    add(/\bdefine:vars\b/g, 'define:vars renders an inline style (CSP style-src self)');
    add(/<style\b[^>]*\bis:inline\b/g, 'inline <style> element (CSP style-src self)');
  } else {
    add(/<style\b/g, 'inline <style> element (CSP style-src self)');
  }
  return findings;
}

/** Blanks comments of every kind found in .astro, .tsx and .ts files, keeping offsets. */
function blankScriptComments(source: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  return blankComments(source)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[\s;{}(])\/\/[^\n]*/g, (match, lead: string) => lead + blank(match.slice(lead.length)));
}

function scanFile(path: string, raw: string): Finding[] {
  if (path.endsWith('.css')) return scanCss(blankComments(raw), 0);
  let source = blankScriptComments(raw);
  const findings: Finding[] = [];
  if (path.endsWith('.astro')) {
    for (const match of source.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
      const start = match.index + (match[1]?.length ?? 0);
      findings.push(...scanCss(match[2] ?? '', start));
    }
    source = source.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) =>
      [open, css.replace(/[^\n]/g, ' '), close].join(''),
    );
  }
  return [...findings, ...scanMarkup(source, path)];
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

test('src/ uses design tokens only: no color or font literals, no style attributes', () => {
  // A guard that reads empty files passes vacuously: make sure both readers return real content.
  expect(SOURCES['/src/styles/global.css']).toContain('@layer');
  expect(SOURCES['/src/layouts/Base.astro']).toContain('<html');
  const report: string[] = [];
  for (const [path, raw] of Object.entries(SOURCES)) {
    if (EXEMPT.includes(path) || EXEMPT_DIRS.some((dir) => path.startsWith(dir))) continue;
    for (const finding of scanFile(path, raw)) {
      report.push(`${path.slice(1)}:${lineOf(raw, finding.index)} ${finding.rule}: ${finding.snippet.trim()}`);
    }
  }
  expect(report).toEqual([]);
});

// The guard checks itself: each probe is [file, source, number of findings].
const PROBES: [string, string, number][] = [
  ['a.css', '.a { color: #fff; background: rgb(0 0 0 / 50%); }', 2],
  ['a.css', '.a { font-family: Arial, sans-serif; } .b { font: 12px Arial; }', 2],
  ['a.css', '.a { color: var(--color-text); font-family: var(--font-body); font: inherit; } #fab { inset: 0; }', 0],
  ['a.css', '/* #fff rgb(0 0 0) font-family: Arial; */ .a { color: var(--color-text); }', 0],
  ['a.astro', '<div style="color: var(--color-text)">x</div>', 1],
  ['a.astro', '<style is:inline>.a { color: var(--color-text); }</style>', 1],
  ['a.astro', '<style define:vars={{ size }}>.a { inline-size: var(--size); }</style>', 1],
  ['a.astro', '<p class="bg-[#ff0000]">x</p><svg><path fill="#000" /></svg>', 2],
  ['a.astro', '<style>.a { color: #123456; }</style>', 1],
  ['a.astro', '<a href="#decade">x</a><!-- rgb(0 0 0) --><style>.a { color: var(--color-text); }</style>', 0],
  ['a.tsx', "export const A = () => <div style={{ color: 'red' }} />;", 1],
  ['a.tsx', "const style = { borderColor: '#abc' }; const c = <p className=\"font-['Inter']\" />;", 2],
  ['a.tsx', 'export const B = () => <style>{css}</style>;', 1],
  ['a.ts', "const style = { width: 1 }; el.setAttribute('style', value); const hash = '#facade';", 1],
];

test.each(PROBES)('the guard finds the expected violations in probe %#', (path, source, expected) => {
  expect(scanFile(path, source)).toHaveLength(expected);
});
