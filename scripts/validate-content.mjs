#!/usr/bin/env node
// Content validator for PLC Museum.
// Checks: JSON Schema (exhibits, stories, image meta), id = file name, decade vs year,
// image files and license sidecars, site illustrations (src/assets/illustrations), SVG safety and the
// illustration format, unverified fields, glossary completeness.
// Usage: node scripts/validate-content.mjs [--only <exhibit-id>] [--quiet]
// Exit code 0 = ok (warnings allowed), 1 = errors.

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const ROOT = process.cwd();
const P = (...p) => path.join(ROOT, ...p);
const rel = (f) => path.relative(ROOT, f) || '.';
// Repository-relative path with forward slashes, the form meta.file and exhibit image paths use.
const repoPath = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const LANGS = ['pt', 'en', 'es', 'de', 'it'];
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|svg)$/i;
const ILLUSTRATIONS_DIR = 'src/assets/illustrations';

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${rel(file)}: ${msg}`);
const warn = (file, msg) => warnings.push(`${rel(file)}: ${msg}`);

async function loadJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function listFiles(dir, pred) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, pred)));
    else if (pred(e.name)) out.push(full);
  }
  return out.sort();
}

function decadeOf(year) {
  if (!Number.isInteger(year)) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

async function compile(schemaFile) {
  const schema = await loadJson(P('content/schema', schemaFile));
  return ajv.compile(schema);
}

const validateExhibit = await compile('exhibit.schema.json');
const validateStory = await compile('story.schema.json');
const validateMeta = await compile('image-meta.schema.json');
const metaSchema = await loadJson(P('content/schema/image-meta.schema.json'));
const LICENSES = new Set(metaSchema.properties.license.enum);

function reportSchema(file, validate) {
  for (const e of validate.errors ?? []) {
    const where = e.instancePath || '/';
    const extra = e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : '';
    err(file, `schema ${where} ${e.message}${extra}`);
  }
}

// SVGs are served same-origin, so one opened directly is a document that can run script under our origin.
// These are text checks on purpose: they run on the raw file (comments included) so nothing hides from them,
// and an illustration has no reason to use any of these features. A denylist alone is not enough (references,
// foreign namespaces and CSS escapes each spell a feature in a way no pattern sees), so the checks also pin the
// file to plain SVG: an element allowlist, the SVG and XLink namespaces only, and no references but the five
// predefined XML entities.

// Rules on the raw text: they judge references and markup, which decoding would hide or invent.
const SVG_RAW_UNSAFE = [
  // A character reference can spell any name or URL (attributeName="&#104;ref") past every pattern below.
  { re: /&#/, why: 'character reference (&#...;)' },
  { re: /&(?!#|(?:amp|lt|gt|quot|apos);)/, why: 'entity reference other than &amp; &lt; &gt; &quot; &apos;' },
  // An XSLT stylesheet replaces the whole document, script included.
  { re: /<\?xml-stylesheet/i, why: '<?xml-stylesheet?> processing instruction' },
];
// Rules on the text with the five predefined entities decoded, so url(&quot;https://...&quot;) reads as a URL.
const SVG_UNSAFE = [
  { re: /<(?:[\w.-]+:)?script\b/i, why: '<script> element' },
  { re: /<(?:[\w.-]+:)?foreignObject\b/i, why: '<foreignObject> element' },
  { re: /<(?:[\w.-]+:)?image\b/i, why: '<image> element (embedded or linked raster)' },
  { re: /[\s/"']on[a-z]+\s*=/i, why: 'on<event> handler attribute' },
  { re: /javascript\s*:/i, why: 'javascript: URL' },
  { re: /url\(\s*['"]?\s*(?:https?:|\/\/)/i, why: 'url() pointing to a remote resource' },
  { re: /@import\s+(?:url\(\s*)?['"]?\s*(?:https?:|\/\/)/i, why: '@import of a remote stylesheet' },
  // A CSS comment between @import and its URL hides the URL from the rule above; an illustration imports nothing.
  { re: /@import\b/i, why: '@import (an illustration carries its own styles)' },
  // image-set() loads URL strings without url(), past the url() rule above.
  { re: /image-set\s*\(/i, why: 'image-set() (loads images by URL string)' },
  // CSS escapes (url(\68ttps://...)) spell any URL or keyword. Presentation attributes are parsed as CSS too, so
  // a backslash is refused anywhere, not only in <style> and style="".
  { re: /\\/, why: 'backslash (CSS escape)' },
  // Entity replacement text is parsed as markup, so an entity can smuggle any element past the checks above.
  { re: /<!ENTITY/i, why: 'entity declaration (<!ENTITY>)' },
  // <!ATTLIST> gives elements default attributes (an href, a handler) that never appear on the element itself.
  { re: /<!ATTLIST/i, why: 'attribute list declaration (<!ATTLIST>)' },
  // <set>/<animate> can rewrite an href at runtime, which the static href check below cannot see.
  { re: /attributeName\s*=\s*['"]?\s*(?:[\w.-]+:)?href\b/i, why: 'animation that rewrites an href' },
  // Attributes that load or submit a URL on XHTML elements (iframe, img, form, button, object).
  { re: /[\s/"'](?:[\w.-]+:)?(?:src|action|formaction|data)\s*=/i, why: 'src, action, formaction or data attribute' },
  // xml:base resolves even "#x" against another document.
  { re: /[\s/"']xml:base\s*=/i, why: 'xml:base attribute' },
];
const SVG_HREF = /[\s/"'](?:[\w.-]+:)?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const SVG_NAMESPACES = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink']);
const SVG_XMLNS = /[\s/"'](xmlns(?::[\w.-]+)?)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
// Names compared with the prefix, so <svg:script> or <h:iframe> is refused whatever namespace the prefix binds.
const SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'use',
  'symbol',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'style',
  'metadata',
]);
// In well-formed XML a raw "<" is always markup; "<!" (comments, CDATA, DOCTYPE) and "<?" are not elements.
const SVG_TAG = /<\/?([^\s/>!?]+)/g;
const XML_PREDEFINED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// One pass, so "&amp;lt;" decodes to the text "&lt;" and never to "<".
const decodePredefined = (text) => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_PREDEFINED[name]);

function checkSvgSafety(file, svg) {
  for (const { re, why } of SVG_RAW_UNSAFE) {
    if (re.test(svg)) err(file, `unsafe SVG: ${why}`);
  }
  for (const m of svg.matchAll(SVG_XMLNS)) {
    const value = m[2] ?? m[3] ?? m[4];
    if (!SVG_NAMESPACES.has(value)) {
      err(file, `unsafe SVG: namespace ${m[1]}="${value}" (only the SVG and XLink namespaces are allowed)`);
    }
  }
  const disallowed = new Set([...svg.matchAll(SVG_TAG)].map((m) => m[1]).filter((name) => !SVG_ELEMENTS.has(name)));
  for (const name of disallowed) err(file, `unsafe SVG: element <${name}> is not in the illustration allowlist`);

  const text = decodePredefined(svg);
  for (const { re, why } of SVG_UNSAFE) {
    if (re.test(text)) err(file, `unsafe SVG: ${why}`);
  }
  for (const m of text.matchAll(SVG_HREF)) {
    const value = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!value.startsWith('#')) {
      err(file, `unsafe SVG: href "${value}" must be a same-document reference starting with "#"`);
    }
  }
}

// TASK-003 format: islands render illustrations as <svg viewBox="0 0 640 260"><use href="<file>#art"/></svg>.
function checkIllustrationFormat(file, svg) {
  const root = svg.replace(/<!--[\s\S]*?-->/g, '').match(/<svg\b[^>]*>/i)?.[0];
  if (!root) {
    err(file, 'illustration has no root <svg> element');
    return;
  }
  const attr = (name) =>
    root
      .match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
      ?.slice(1)
      .find((v) => v !== undefined);
  if (attr('id') !== 'art') err(file, 'illustration root <svg> needs id="art" (referenced as <use href="...#art">)');
  const viewBox = attr('viewBox');
  const box = (viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box.join(' ') !== '0 0 640 260') {
    err(
      file,
      `illustration root <svg> needs viewBox="0 0 640 260" (found ${viewBox === undefined ? 'none' : `"${viewBox}"`})`,
    );
  }
}

// ---- exhibits
const exhibitFiles = (await listFiles(P('content/exhibits'), (n) => n.endsWith('.json'))).filter(
  (f) => !only || path.basename(f, '.json') === only,
);
if (only && exhibitFiles.length === 0) err(P('content/exhibits'), `no exhibit with id "${only}"`);

const ids = new Map();
const slugs = new Map();
let publishedCount = 0;
// Absolute paths of SVGs that are rendered as illustrations; checked once even when several exhibits share one.
const illustrationSvgs = new Set();

for (const file of exhibitFiles) {
  let data;
  try {
    data = await loadJson(file);
  } catch (e) {
    err(file, `invalid JSON: ${e.message}`);
    continue;
  }
  // The schema reports a non-object, but the checks below would crash on null before the report is printed.
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    err(file, 'an exhibit file must hold one JSON object');
    continue;
  }
  if (!validateExhibit(data)) reportSchema(file, validateExhibit);

  const base = path.basename(file, '.json');
  if (data.id !== base) err(file, `id "${data.id}" must equal file name "${base}"`);
  if (data.slug !== data.id) warn(file, `slug "${data.slug}" differs from id "${data.id}"`);
  if (ids.has(data.id)) err(file, `duplicate id "${data.id}" (also in ${rel(ids.get(data.id))})`);
  ids.set(data.id, file);
  // The Astro glob loader keys entries by slug, so a second exhibit with the same slug silently replaces the first.
  if (slugs.has(data.slug)) err(file, `duplicate slug "${data.slug}" (also in ${rel(slugs.get(data.slug))})`);
  slugs.set(data.slug, file);

  const expected = decadeOf(data.year_introduced);
  if (expected && data.decade !== expected) {
    err(
      file,
      `decade "${data.decade}" does not match year_introduced ${data.year_introduced} (expected "${expected}")`,
    );
  }

  // images and licenses
  for (const img of data.images ?? []) {
    if (!img?.file) continue;
    if (!existsSync(P(img.file))) err(file, `image file missing: ${img.file}`);
    else if (img.is_illustration && /\.svg$/i.test(img.file)) illustrationSvgs.add(P(img.file));
    if (!img.meta || !existsSync(P(img.meta))) {
      err(file, `image meta missing: ${img.meta ?? '(none)'} for ${img.file}`);
      continue;
    }
    let meta;
    try {
      meta = await loadJson(P(img.meta));
    } catch (e) {
      err(P(img.meta), `invalid JSON: ${e.message}`);
      continue;
    }
    if (!validateMeta(meta)) reportSchema(P(img.meta), validateMeta);
    if (meta.file !== img.file) err(P(img.meta), `meta.file "${meta.file}" does not match exhibit image "${img.file}"`);
    if (!LICENSES.has(meta.license)) err(P(img.meta), `license "${meta.license}" not in allowlist`);
    if (meta.license === 'original-illustration' && !img.is_illustration) {
      warn(file, `${img.file} is an original illustration; set images[].is_illustration to true`);
    }
    if (meta.license === 'permission-granted' && !meta.permission_evidence) {
      err(P(img.meta), 'permission-granted requires permission_evidence');
    }
  }

  // verification bookkeeping
  const uf = data.verification?.unverified_fields ?? [];
  for (const fp of uf) {
    const v = getPath(data, fp);
    if (v === undefined) warn(file, `unverified field path not found: ${fp}`);
    else if (v !== null && fp !== 'year_introduced') {
      warn(file, `unverified field "${fp}" has a value (${JSON.stringify(v)}); source it or set it to null`);
    }
  }
  if (data.year_introduced_precision === 'disputed' && !data.verification?.notes) {
    warn(file, 'year_introduced_precision is "disputed" but verification.notes is empty');
  }

  // sources sanity
  const srcIds = new Set();
  for (const s of data.sources ?? []) {
    if (srcIds.has(s.id)) err(file, `duplicate source id ${s.id}`);
    srcIds.add(s.id);
    if (!s.url && !s.isbn && !s.publication_number) warn(file, `source ${s.id} has no url, isbn or publication number`);
    if (s.type === 'wikipedia_pointer' && (data.sources ?? []).length < 2) {
      warn(file, 'wikipedia_pointer is the only source; add the primary source it points to');
    }
  }

  // publication gate (mirrors schema, with clearer messages)
  if (data.review_status === 'published') {
    publishedCount += 1;
    if (data.verification?.level !== 'verified') err(file, 'published exhibit must have verification.level "verified"');
    if (uf.length) err(file, `published exhibit still has unverified fields: ${uf.join(', ')}`);
    if (!(data.sources ?? []).length) err(file, 'published exhibit needs at least one source');
    if (!(data.images ?? []).length) err(file, 'published exhibit needs at least one image or illustration');
    for (const lang of ['pt', 'en']) {
      if (data.text?.[lang]?.status !== 'verified') err(file, `published exhibit needs text.${lang}.status "verified"`);
    }
  }

  // text blocks
  for (const lang of Object.keys(data.text ?? {})) {
    if (!LANGS.includes(lang)) err(file, `unknown language block "${lang}"`);
    const t = data.text[lang];
    if (t && /[\u2014\u2013]/.test(JSON.stringify(t)))
      warn(file, `text.${lang} contains an em or en dash; house style uses commas, colons or parentheses`);
  }
}

// ---- stories (repository holds approved stories only)
const storyFiles = await listFiles(P('content/stories'), (n) => n.endsWith('.json'));
for (const file of storyFiles) {
  let data;
  try {
    data = await loadJson(file);
  } catch (e) {
    err(file, `invalid JSON: ${e.message}`);
    continue;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    err(file, 'a story file must hold one JSON object');
    continue;
  }
  if (!validateStory(data)) reportSchema(file, validateStory);
  const dirId = path.basename(path.dirname(file));
  if (data.exhibit_id !== dirId) err(file, `exhibit_id "${data.exhibit_id}" must match folder "${dirId}"`);
  if (!ids.has(data.exhibit_id) && !only && !existsSync(P('content/exhibits', `${data.exhibit_id}.json`))) {
    err(file, `story references unknown exhibit "${data.exhibit_id}"`);
  }
  if (data.id !== path.basename(file, '.json')) err(file, `id "${data.id}" must equal file name`);
  if (/<[a-z!/][^>]*>/i.test(data.text ?? '')) err(file, 'story text contains HTML; stories are plain text');
}

// ---- orphan images: every image under content/images needs a meta file
const imageFiles = await listFiles(P('content/images'), (n) => IMAGE_EXT.test(n));
for (const img of imageFiles) {
  const meta = img.replace(IMAGE_EXT, '.meta.json');
  if (!existsSync(meta)) err(img, 'image without .meta.json sidecar (license required)');
}

// ---- site illustrations (TASK-003): original artwork shipped with the site, licensed like any other image
const illustrationFiles = await listFiles(P(ILLUSTRATIONS_DIR), (n) => IMAGE_EXT.test(n));
for (const img of illustrationFiles) {
  if (/\.svg$/i.test(img)) illustrationSvgs.add(img);
  // Illustrations are drawn in currentColor so they follow the era tokens; a raster cannot (TASK-003).
  else err(img, `${ILLUSTRATIONS_DIR}/ accepts SVG only`);
  const metaFile = img.replace(IMAGE_EXT, '.meta.json');
  if (!existsSync(metaFile)) {
    err(img, 'illustration without .meta.json sidecar (license required)');
    continue;
  }
  let meta;
  try {
    meta = await loadJson(metaFile);
  } catch (e) {
    err(metaFile, `invalid JSON: ${e.message}`);
    continue;
  }
  if (!validateMeta(meta)) reportSchema(metaFile, validateMeta);
  if (meta?.file !== repoPath(img)) err(metaFile, `meta.file "${meta?.file}" must equal "${repoPath(img)}"`);
  if (meta?.license !== 'original-illustration') {
    err(metaFile, `license "${meta?.license}" not allowed: ${ILLUSTRATIONS_DIR}/ holds original illustrations only`);
  }
}

// ---- SVG safety for every SVG the site serves, then the illustration format
const svgFiles = [...imageFiles, ...illustrationFiles].filter((f) => /\.svg$/i.test(f));
const svgText = new Map();
for (const svg of new Set([...svgFiles, ...illustrationSvgs])) {
  try {
    svgText.set(svg, await readFile(svg, 'utf8'));
  } catch (e) {
    err(svg, `unreadable SVG: ${e.message}`);
  }
}
for (const svg of svgFiles) if (svgText.has(svg)) checkSvgSafety(svg, svgText.get(svg));
for (const svg of illustrationSvgs) if (svgText.has(svg)) checkIllustrationFormat(svg, svgText.get(svg));

// ---- glossary completeness
if (existsSync(P('content/glossary.json'))) {
  try {
    const g = await loadJson(P('content/glossary.json'));
    for (const [key, val] of Object.entries(g)) {
      if (key.startsWith('_')) continue;
      for (const lang of LANGS) {
        if (!val?.[lang]) err(P('content/glossary.json'), `term "${key}" missing language "${lang}"`);
      }
    }
  } catch (e) {
    err(P('content/glossary.json'), `invalid JSON: ${e.message}`);
  }
} else {
  warn(P('content/glossary.json'), 'glossary not found');
}

// ---- report
if (!quiet) {
  console.log(
    `exhibits: ${exhibitFiles.length} checked, ${publishedCount} published; stories: ${storyFiles.length}; images: ${imageFiles.length}; illustrations: ${illustrationFiles.length}`,
  );
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(
    errors.length
      ? `\n${errors.length} error(s), ${warnings.length} warning(s)`
      : `\nOK, ${warnings.length} warning(s)`,
  );
} else if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
}
process.exit(errors.length ? 1 : 0);
