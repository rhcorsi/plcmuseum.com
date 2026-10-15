// Zod mirror of content/schema/*.json for the Astro content collections. The JSON Schemas are the source of
// truth: tests/content/schema-parity.test.ts fails when this file and the schemas disagree, and the type
// assertions at the bottom fail `pnpm typecheck` when the shapes drift from src/content/types.ts.
import { z } from 'astro/zod';
import type { Exhibit, FieldStory, ImageMeta } from './types';

const unique = <T extends z.ZodType>(item: T) =>
  z.array(item).refine((items) => new Set(items).size === items.length, { message: 'items must be unique' });

const nullableString = (max: number) => z.string().max(max).nullable().optional();

const slug = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const year = z.int().min(1950).max(2100);
const countryCode = z.string().regex(/^[A-Z]{2}$/);

export const DECADES = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'] as const;
export const decadeSchema = z.enum(DECADES);

export const IMAGE_FILE_PATTERN = /^content\/images\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/;
export const IMAGE_META_PATTERN = /^content\/images\/[a-z0-9-]+\/[A-Za-z0-9._-]+\.meta\.json$/;
// Sidecars also cover the generic illustrations shipped with the site (TASK-003).
export const META_FILE_PATTERN =
  /^(content\/images\/[a-z0-9-]+|src\/assets\/illustrations)\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/;

export const textBlockSchema = z.strictObject({
  tagline: z.string().min(10).max(120),
  summary: z.string().min(40).max(600),
  field_quirk: nullableString(240),
  alt_text: z.string().min(10).max(200),
  status: z.enum(['verified', 'machine', 'needs_review']),
});

export const exhibitSchema = z
  .strictObject({
    id: slug,
    slug,
    name: z.string().min(2).max(80),
    family: nullableString(80),
    manufacturer: z.string().min(2).max(80),
    brand_at_launch: nullableString(80),
    current_owner: z.string().min(2).max(80),
    country_of_origin: countryCode.nullable().optional(),
    category: z.enum(['plc', 'dcs', 'multiloop', 'hmi', 'programmer', 'network', 'software', 'rtu']),
    architecture: z.enum([
      'modular',
      'compact',
      'micro',
      'pac',
      'dcs_redundant',
      'multiloop',
      'software_defined',
      'terminal',
      'protocol',
      'other',
    ]),
    sectors: unique(
      z.enum([
        'discrete',
        'process',
        'hybrid',
        'infrastructure',
        'automotive',
        'food_beverage',
        'pulp_paper',
        'oil_gas',
        'chemical',
        'metals',
        'water',
        'energy',
        'pharma',
        'other',
      ]),
    ).optional(),
    decade: decadeSchema,
    year_introduced: year,
    year_introduced_precision: z.enum(['exact', 'approximate', 'disputed']),
    era_theme_override: decadeSchema.nullable().optional(),
    specs: z.strictObject({
      cpu: nullableString(80),
      scan_time_ms_per_k: z.number().min(0).nullable().optional(),
      memory_words: z.int().min(0).nullable().optional(),
      memory_kb: z.number().min(0).nullable().optional(),
      memory_type: nullableString(80),
      io_max: z.int().min(0).nullable().optional(),
      networks: unique(z.string().max(40)).optional(),
      languages: unique(z.enum(['LD', 'IL', 'ST', 'FBD', 'SFC', 'CFC', 'BASIC', 'FORTH', 'C', 'proprietary'])).optional(),
      redundancy: nullableString(120),
    }),
    lifecycle: z.strictObject({
      discontinued_year: year.nullable().optional(),
      end_of_support_year: year.nullable().optional(),
      last_firmware: nullableString(40),
      migration_paths: z.array(z.string().max(80)).optional(),
      still_in_service_note: nullableString(240),
    }),
    related_modules: z
      .array(
        z.strictObject({
          id: slug,
          label: z.string().max(80),
          year: year.nullable().optional(),
          note: nullableString(240),
        }),
      )
      .optional(),
    images: z.array(
      z.strictObject({
        file: z.string().regex(IMAGE_FILE_PATTERN),
        role: z.enum(['hero', 'detail', 'programmer', 'console', 'document']),
        meta: z.string().regex(IMAGE_META_PATTERN),
        is_illustration: z.boolean().optional(),
      }),
    ),
    links: z
      .array(
        z.strictObject({
          type: z.enum(['partner', 'vendor_history', 'video', 'manual', 'community', 'archive']),
          partner: nullableString(80),
          label: z.string().max(120),
          url: z.url({ protocol: /^https$/ }).regex(/^https:\/\//),
        }),
      )
      .optional(),
    sources: z.array(
      z.strictObject({
        id: z.string().regex(/^src-[a-z0-9-]+$/),
        type: z.enum([
          'manual',
          'datasheet',
          'vendor_history',
          'book',
          'article',
          'interview',
          'standard',
          'archive',
          'wikipedia_pointer',
        ]),
        title: z.string().max(200),
        publisher: nullableString(120),
        publication_number: nullableString(60),
        url: z.url().nullable().optional(),
        isbn: nullableString(20),
        year: z.int().min(1900).max(2100).nullable().optional(),
        accessed: z.iso.date(),
        note: nullableString(300),
      }),
    ),
    verification: z.strictObject({
      level: z.enum(['unverified', 'partial', 'verified']),
      unverified_fields: unique(z.string().max(80)),
      reviewer: nullableString(80),
      date: z.iso.date().nullable().optional(),
      notes: nullableString(1000),
    }),
    text: z.strictObject({
      pt: textBlockSchema,
      en: textBlockSchema.optional(),
      es: textBlockSchema.optional(),
      de: textBlockSchema.optional(),
      it: textBlockSchema.optional(),
    }),
    tags: unique(z.string().max(40)).optional(),
    stories_enabled: z.boolean().optional(),
    review_status: z.enum(['draft', 'review', 'published']),
  })
  .superRefine((exhibit, ctx) => {
    // Mirrors the schema's `allOf` publication gate (docs/CONTENT_GUIDE.md section 6).
    if (exhibit.review_status !== 'published') return;
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (exhibit.verification.level !== 'verified') fail('published exhibit must have verification.level "verified"');
    if (exhibit.verification.unverified_fields.length > 0) fail('published exhibit still has unverified fields');
    if (exhibit.sources.length === 0) fail('published exhibit needs at least one source');
    if (exhibit.images.length === 0) fail('published exhibit needs at least one image or illustration');
    if (exhibit.text.pt.status !== 'verified') fail('published exhibit needs text.pt.status "verified"');
    if (exhibit.text.en?.status !== 'verified') fail('published exhibit needs text.en with status "verified"');
  });

export const storySchema = z.strictObject({
  id: z.string().regex(/^st-[a-z0-9]{8,32}$/),
  exhibit_id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  display_name: z.string().min(2).max(60),
  role: nullableString(80),
  country: countryCode.nullable().optional(),
  original_lang: z.enum(['pt', 'en', 'es', 'de', 'it', 'other']),
  year_of_memory: z.int().min(1960).max(2100).nullable().optional(),
  text: z.string().min(40).max(1500),
  consent: z.strictObject({
    publish_with_display_name: z.literal(true),
    license: z.literal('CC-BY-4.0'),
    machine_translation: z.boolean(),
  }),
  status: z.literal('approved'),
  submitted_at: z.iso.datetime({ offset: true }),
  approved_at: z.iso.datetime({ offset: true }).nullable().optional(),
  edited_note: nullableString(200),
});

export const imageMetaSchema = z
  .strictObject({
    file: z.string().regex(META_FILE_PATTERN),
    author: z.string().min(2).max(120),
    license: z.enum([
      'CC0-1.0',
      'CC-BY-4.0',
      'CC-BY-SA-4.0',
      'CC-BY-3.0',
      'CC-BY-SA-3.0',
      'public-domain',
      'own-work',
      'permission-granted',
      'original-illustration',
    ]),
    source_url: z.url().nullable(),
    attribution_text: z.string().max(300),
    permission_evidence: z.string().max(300).nullable(),
    modifications: z.array(z.enum(['cut-out', 'color-correction', 'crop', 'resize', 'none'])),
    shows_logo: z.boolean().optional(),
    added: z.iso.date(),
  })
  .superRefine((meta, ctx) => {
    if (meta.license === 'permission-granted' && (meta.permission_evidence ?? '').length < 5) {
      ctx.addIssue({ code: 'custom', message: 'permission-granted requires permission_evidence' });
    }
  });

/** One glossary term (content/glossary.json): engineer jargon per language, no JSON Schema of its own. */
export const glossaryTermSchema = z.strictObject({
  pt: z.string().min(1),
  en: z.string().min(1),
  es: z.string().min(1),
  de: z.string().min(1),
  it: z.string().min(1),
});

// Compile-time parity with the generated types: parsed data must satisfy the generated interface, and any value
// of the generated interface must be accepted as input. A drift fails `pnpm typecheck`.
type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;
export type SchemaParity = [
  Assert<Extends<z.output<typeof exhibitSchema>, Exhibit>>,
  Assert<Extends<Exhibit, z.input<typeof exhibitSchema>>>,
  Assert<Extends<z.output<typeof storySchema>, FieldStory>>,
  Assert<Extends<FieldStory, z.input<typeof storySchema>>>,
  Assert<Extends<z.output<typeof imageMetaSchema>, ImageMeta>>,
  Assert<Extends<ImageMeta, z.input<typeof imageMetaSchema>>>,
];
