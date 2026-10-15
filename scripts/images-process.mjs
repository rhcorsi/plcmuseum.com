#!/usr/bin/env node
// Builds AVIF/WebP variants (320 to 1600 px) and stage cut-outs from the licensed raster originals in
// content/images (docs/ARCHITECTURE.md section 6, step 3). Outputs are build artifacts, never committed.
// Phase 0 skeleton: the pipeline needs the sharp dependency (Phase 2, owner approval). Until then it succeeds
// only while there is nothing to process, so a raster added early fails loudly instead of shipping unprocessed.
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, 'content', 'images');
const RASTER = /\.(jpg|jpeg|png|webp)$/i;

async function listRasters(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listRasters(full)));
    else if (RASTER.test(entry.name)) out.push(full);
  }
  return out.sort();
}

const rasters = await listRasters(IMAGES_DIR);
if (rasters.length === 0) {
  console.log('images:process: no raster images to process');
  process.exit(0);
}

console.error(`images:process: ${rasters.length} raster image(s) need AVIF/WebP variants:`);
for (const file of rasters) console.error(`  ${path.relative(ROOT, file).split(path.sep).join('/')}`);
console.error(
  [
    'The AVIF/WebP pipeline (docs/ARCHITECTURE.md section 6, step 3) is not implemented yet: it needs the sharp',
    "dependency, which waits for the owner's approval in Phase 2. Until then exhibits use illustrations only.",
  ].join('\n'),
);
process.exit(1);
