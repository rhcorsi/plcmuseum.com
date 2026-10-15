#!/usr/bin/env node
// Content validator for PLC Museum.
// Checks: JSON Schema (exhibits, stories, image meta), id = file name, decade vs year,
// image files and license sidecars, unverified fields, glossary completeness.
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
const LANGS = ['pt', 'en', 'es', 'de', 'it'];

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

// ---- exhibits
const exhibitFiles = (await listFiles(P('content/exhibits'), (n) => n.endsWith('.json'))).filter(
  (f) => !only || path.basename(f, '.json') === only,
);
if (only && exhibitFiles.length === 0) err(P('content/exhibits'), `no exhibit with id "${only}"`);

const ids = new Map();
let publishedCount = 0;

for (const file of exhibitFiles) {
  let data;
  try {
    data = await loadJson(file);
  } catch (e) {
    err(file, `invalid JSON: ${e.message}`);
    continue;
  }
  if (!validateExhibit(data)) reportSchema(file, validateExhibit);

  const base = path.basename(file, '.json');
  if (data.id !== base) err(file, `id "${data.id}" must equal file name "${base}"`);
  if (data.slug !== data.id) warn(file, `slug "${data.slug}" differs from id "${data.id}"`);
  if (ids.has(data.id)) err(file, `duplicate id "${data.id}" (also in ${rel(ids.get(data.id))})`);
  ids.set(data.id, file);

  const expected = decadeOf(data.year_introduced);
  if (expected && data.decade !== expected) {
    err(file, `decade "${data.decade}" does not match year_introduced ${data.year_introduced} (expected "${expected}")`);
  }

  // images and licenses
  for (const img of data.images ?? []) {
    if (!img?.file) continue;
    if (!existsSync(P(img.file))) err(file, `image file missing: ${img.file}`);
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
    if (t && /[\u2014\u2013]/.test(JSON.stringify(t))) warn(file, `text.${lang} contains an em or en dash; house style uses commas, colons or parentheses`);
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
const imageFiles = await listFiles(P('content/images'), (n) => /\.(jpg|jpeg|png|webp|svg)$/i.test(n));
for (const img of imageFiles) {
  const meta = img.replace(/\.(jpg|jpeg|png|webp|svg)$/i, '.meta.json');
  if (!existsSync(meta)) err(img, 'image without .meta.json sidecar (license required)');
}

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
  console.log(`exhibits: ${exhibitFiles.length} checked, ${publishedCount} published; stories: ${storyFiles.length}; images: ${imageFiles.length}`);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(errors.length ? `\n${errors.length} error(s), ${warnings.length} warning(s)` : `\nOK, ${warnings.length} warning(s)`);
} else if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
}
process.exit(errors.length ? 1 : 0);
