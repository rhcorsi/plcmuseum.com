// scripts/validate-content.mjs on the repository and on minimal temp trees: site illustrations, their sidecars,
// SVG safety and the TASK-003 illustration format.
import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempTree, REPO, removeTree, runScript, writeFiles } from './helpers.mjs';

const VALIDATOR = 'scripts/validate-content.mjs';

const svg = (inner = '', { root = 'id="art" viewBox="0 0 640 260"', prolog = '' } = {}) =>
  `${prolog}<svg xmlns="http://www.w3.org/2000/svg" ${root} role="img" aria-labelledby="t">
  <title id="t">Test illustration</title>
  <rect x="20" y="40" width="600" height="180" fill="none" stroke="currentColor" stroke-width="4"/>
  ${inner}
</svg>
`;

const meta = (file, overrides = {}) => ({
  file,
  author: 'PLC Museum (original illustration)',
  license: 'original-illustration',
  source_url: null,
  attribution_text: 'Illustration: PLC Museum, CC BY 4.0',
  permission_evidence: null,
  modifications: ['none'],
  added: '2026-10-14',
  ...overrides,
});

const ILLUSTRATION = 'src/assets/illustrations/rack-test.svg';
const ILLUSTRATION_META = 'src/assets/illustrations/rack-test.meta.json';

it('passes on the repository', () => {
  const r = runScript(VALIDATOR);
  expect(r.status, r.output).toBe(0);
});

describe('in a temp tree', () => {
  let tmp;
  beforeEach(() => {
    tmp = makeTempTree();
  });
  afterEach(() => {
    removeTree(tmp);
  });
  const validate = () => runScript(VALIDATOR, [], { cwd: tmp });

  it('reports an exhibit file holding null instead of crashing', () => {
    writeFiles(tmp, { 'content/exhibits/fx-null.json': 'null' });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('must hold one JSON object');
    expect(r.output).not.toContain('TypeError');
  });

  it('passes a clean illustration', () => {
    writeFiles(tmp, { [ILLUSTRATION]: svg(), [ILLUSTRATION_META]: meta(ILLUSTRATION) });
    const r = validate();
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain('illustrations: 1');
  });

  it('fails an SVG with <script> under content/images', () => {
    const file = 'content/images/fx-test/hero.svg';
    writeFiles(tmp, {
      [file]: svg('<script>alert(1)</script>'),
      'content/images/fx-test/hero.meta.json': meta(file),
    });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('unsafe SVG: <script> element');
  });

  it.each([
    ['foreignObject', svg('<foreignObject width="10" height="10"></foreignObject>'), '<foreignObject> element'],
    ['embedded raster', svg('<image width="1" height="1" href="#x"/>'), '<image> element'],
    ['event handler', svg('<rect width="1" height="1" onclick="alert(1)"/>'), 'on<event> handler attribute'],
    ['javascript: URL', svg('<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'), 'javascript: URL'],
    ['external href', svg('<use href="https://example.com/a.svg#x"/>'), 'must be a same-document reference'],
    ['external xlink:href', svg('<use xlink:href="other.svg#x"/>'), 'must be a same-document reference'],
    ['remote url()', svg('<rect width="1" height="1" fill="url(https://example.com/p.svg#g)"/>'), 'url() pointing'],
    ['protocol-relative @import', svg('<style>@import "//example.com/a.css";</style>'), '@import of a remote'],
    ['entity declaration', svg('', { prolog: '<!DOCTYPE svg [<!ENTITY x "y">]>\n' }), '<!ENTITY>'],
    ['href animation', svg('<set attributeName="href" to="#y"/>'), 'animation that rewrites an href'],
  ])('fails an illustration with %s', (_name, body, message) => {
    writeFiles(tmp, { [ILLUSTRATION]: body, [ILLUSTRATION_META]: meta(ILLUSTRATION) });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain(message);
  });

  // Crafted files that passed the earlier denylist: each spells a forbidden feature in a way no pattern saw.
  const XHTML = 'xmlns:h="http://www.w3.org/1999/xhtml"';
  it.each([
    [
      'character references spelling an href animation',
      svg('<set attributeName="&#104;ref" to="&#106;avascript:alert(1)"/>'),
      ['character reference (&#...;)', 'element <set> is not in the illustration allowlist'],
    ],
    [
      'XHTML-namespace elements',
      svg(
        `<g ${XHTML}><h:iframe src="https://example.com/"/><h:img src="https://example.com/p.png"/>` +
          '<h:form action="https://example.com/"><h:button formaction="https://example.com/">x</h:button></h:form></g>',
      ),
      [
        'namespace xmlns:h="http://www.w3.org/1999/xhtml"',
        'element <h:iframe> is not in the illustration allowlist',
        'element <h:img> is not in the illustration allowlist',
        'element <h:form> is not in the illustration allowlist',
        'src, action, formaction or data attribute',
      ],
    ],
    [
      'CSS escapes in <style>',
      svg('<style>rect{fill:url(\\68ttps://example.com/p.svg#g)}@import "\\68ttps://example.com/a.css";</style>'),
      ['backslash (CSS escape)'],
    ],
    [
      'a CSS escape in style=""',
      svg('<rect width="1" height="1" style="fill:url(\\68ttps://example.com/p.svg#g)"/>'),
      ['backslash (CSS escape)'],
    ],
    [
      'an XSLT stylesheet',
      svg('', { prolog: '<?xml-stylesheet type="text/xsl" href="#x"?>\n' }),
      ['<?xml-stylesheet?> processing instruction'],
    ],
    ['a named entity', svg('<text x="1" y="1">a&nbsp;b</text>'), ['entity reference other than']],
    [
      'a remote url() quoted with &quot;',
      svg('<rect width="1" height="1" fill="url(&quot;https://example.com/p.svg#g&quot;)"/>'),
      ['url() pointing to a remote resource'],
    ],
    [
      'an @import hidden behind a CSS comment',
      svg('<style>@import/**/"https://example.com/a.css";</style>'),
      ['@import (an illustration carries its own styles)'],
    ],
    [
      'image-set()',
      svg('<style>svg{background-image:image-set("https://example.com/p.png" 1x)}</style>'),
      ['image-set()'],
    ],
    ['xml:base', svg('<use href="#x" xml:base="https://example.com/"/>'), ['xml:base attribute']],
    [
      'an attribute default declaration',
      svg('', { prolog: '<!DOCTYPE svg [<!ATTLIST use href CDATA "https://example.com/a.svg#x">]>\n' }),
      ['attribute list declaration (<!ATTLIST>)'],
    ],
    [
      'the default namespace redefined',
      svg('<g xmlns="http://www.w3.org/1999/xhtml"><style>p{}</style></g>'),
      ['namespace xmlns="http://www.w3.org/1999/xhtml"'],
    ],
    ['an element outside the allowlist', svg('<a href="#t"><rect width="1" height="1"/></a>'), ['element <a>']],
    ['a prefixed SVG element', svg('<svg:rect width="1" height="1"/>'), ['element <svg:rect>']],
  ])('fails an illustration with %s', (_name, body, messages) => {
    writeFiles(tmp, { [ILLUSTRATION]: body, [ILLUSTRATION_META]: meta(ILLUSTRATION) });
    const r = validate();
    expect(r.status).toBe(1);
    for (const message of messages) expect(r.output).toContain(message);
  });

  it('passes a clean illustration that uses every allowlisted element', () => {
    const body = svg(
      `<metadata>Original illustration for the tests</metadata>
  <desc>Every element of the allowlist, the XLink namespace and the five predefined entities: &amp; &lt; &gt; &quot; &apos;</desc>
  <style>.trim { stroke: currentColor; stroke-width: 2; fill: url(#fade); }</style>
  <defs>
    <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-opacity="0"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-opacity="0"/></radialGradient>
    <clipPath id="clip"><rect width="640" height="260"/></clipPath>
    <mask id="hole"><rect width="640" height="260" fill="white"/><circle cx="320" cy="130" r="10" fill="black"/></mask>
    <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="currentColor"/></pattern>
    <symbol id="led" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="url(#glow)"/></symbol>
  </defs>
  <g clip-path="url(#clip)" mask="url(#hole)">
    <ellipse cx="100" cy="100" rx="20" ry="10" class="trim"/>
    <line x1="0" y1="250" x2="640" y2="250" stroke="currentColor"/>
    <polyline points="10,10 20,20 30,10" fill="none" stroke="currentColor"/>
    <polygon points="40,10 50,20 60,10" fill="url(#grid)"/>
    <use href="#led" x="60" y="80" width="10" height="10"/>
    <use xlink:href="#led" x="80" y="80" width="10" height="10"/>
    <text x="40" y="200" font-size="16" fill="currentColor">I/O <tspan font-weight="bold">&amp; CPU</tspan></text>
  </g>`,
      { root: 'id="art" viewBox="0 0 640 260" xmlns:xlink="http://www.w3.org/1999/xlink"' },
    );
    writeFiles(tmp, { [ILLUSTRATION]: body, [ILLUSTRATION_META]: meta(ILLUSTRATION) });
    const r = validate();
    expect(r.status, r.output).toBe(0);
  });

  it('fails two exhibits that share a slug', () => {
    // The real exhibit, copied twice under new ids and file names; only the slug collides.
    const base = JSON.parse(readFileSync(path.join(REPO, 'content', 'exhibits', 'ab-plc-5.json'), 'utf8'));
    cpSync(path.join(REPO, 'content', 'images', base.id), path.join(tmp, 'content', 'images', base.id), {
      recursive: true,
    });
    writeFiles(tmp, {
      'content/exhibits/fx-slug-a.json': { ...base, id: 'fx-slug-a' },
      'content/exhibits/fx-slug-b.json': { ...base, id: 'fx-slug-b' },
    });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain(`${path.join('content', 'exhibits', 'fx-slug-b.json')}: duplicate slug "${base.slug}"`);
    expect(r.output).toContain('1 error(s)');
  });

  it('fails an illustration without id="art"', () => {
    writeFiles(tmp, {
      [ILLUSTRATION]: svg('', { root: 'viewBox="0 0 640 260"' }),
      [ILLUSTRATION_META]: meta(ILLUSTRATION),
    });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('needs id="art"');
  });

  it('fails an illustration with another viewBox', () => {
    writeFiles(tmp, {
      [ILLUSTRATION]: svg('', { root: 'id="art" viewBox="0 0 320 130"' }),
      [ILLUSTRATION_META]: meta(ILLUSTRATION),
    });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('needs viewBox="0 0 640 260"');
  });

  it('fails an illustration without a sidecar', () => {
    writeFiles(tmp, { [ILLUSTRATION]: svg() });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('illustration without .meta.json sidecar');
  });

  it('fails an illustration sidecar with license CC-BY-4.0', () => {
    writeFiles(tmp, { [ILLUSTRATION]: svg(), [ILLUSTRATION_META]: meta(ILLUSTRATION, { license: 'CC-BY-4.0' }) });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('license "CC-BY-4.0" not allowed');
  });

  it('fails a raster file among the illustrations', () => {
    const png = 'src/assets/illustrations/rack-test.png';
    writeFiles(tmp, { [png]: 'not really a png', [ILLUSTRATION_META]: meta(png) });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain('accepts SVG only');
  });

  it('fails a sidecar whose file names another image', () => {
    writeFiles(tmp, {
      [ILLUSTRATION]: svg(),
      [ILLUSTRATION_META]: meta('src/assets/illustrations/other.svg'),
    });
    const r = validate();
    expect(r.status).toBe(1);
    expect(r.output).toContain(`must equal "${ILLUSTRATION}"`);
  });

  describe('exhibit illustrations under content/images', () => {
    const file = 'content/images/fx-test/hero.svg';
    // A fictional draft exhibit: the smallest document the schema accepts with one illustration.
    const exhibit = {
      id: 'fx-test',
      slug: 'fx-test',
      name: 'Test Controller',
      manufacturer: 'Fixture Controls',
      current_owner: 'Fixture Controls',
      category: 'plc',
      architecture: 'modular',
      decade: '1980s',
      year_introduced: 1984,
      year_introduced_precision: 'exact',
      specs: {},
      lifecycle: {},
      images: [{ file, role: 'hero', meta: 'content/images/fx-test/hero.meta.json', is_illustration: true }],
      sources: [],
      verification: { level: 'unverified', unverified_fields: [] },
      text: {
        pt: {
          tagline: 'Controlador fictício para testes.',
          summary: 'Texto fictício, longo o bastante para cumprir o mínimo do resumo.',
          alt_text: 'Ilustração fictícia de um controlador.',
          status: 'needs_review',
        },
      },
      review_status: 'draft',
    };

    it('passes when the illustration has the TASK-003 format', () => {
      writeFiles(tmp, {
        'content/exhibits/fx-test.json': exhibit,
        [file]: svg(),
        'content/images/fx-test/hero.meta.json': meta(file),
      });
      const r = validate();
      expect(r.status, r.output).toBe(0);
    });

    it('fails when the illustration lacks id="art"', () => {
      writeFiles(tmp, {
        'content/exhibits/fx-test.json': exhibit,
        [file]: svg('', { root: 'viewBox="0 0 640 260"' }),
        'content/images/fx-test/hero.meta.json': meta(file),
      });
      const r = validate();
      expect(r.status).toBe(1);
      expect(r.output).toContain('needs id="art"');
    });
  });
});
