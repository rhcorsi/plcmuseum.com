// content/schema/*.json is the source of truth; src/content/schemas.ts mirrors it in Zod for the Astro collections.
// The content gate (Ajv) and the build (Zod) must never disagree about a document, so every case below is judged
// by both and must get the same verdict.
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  exhibitSchema,
  IMAGE_FILE_PATTERN,
  IMAGE_META_PATTERN,
  imageMetaSchema,
  META_FILE_PATTERN,
  storySchema,
  textBlockSchema,
} from '../../src/content/schemas';
import type { Exhibit, FieldStory, ImageMeta, TextBlock } from '../../src/content/types';
import { fixtureStories } from '../../src/fixtures/stories';
import { ajvExhibit, ajvImageMeta, ajvStory, exhibitJsonSchema, imageMetaJsonSchema, storyJsonSchema } from './ajv';

type Kind = 'exhibit' | 'story' | 'meta';
type ZodLike = { safeParse(doc: unknown): { success: boolean; error?: { issues: unknown[] } } };

const VALIDATORS: Record<Kind, { ajv: ValidateFunction; zod: ZodLike }> = {
  exhibit: { ajv: ajvExhibit, zod: exhibitSchema },
  story: { ajv: ajvStory, zod: storySchema },
  meta: { ajv: ajvImageMeta, zod: imageMetaSchema },
};

function judge(kind: Kind, doc: unknown) {
  const { ajv, zod } = VALIDATORS[kind];
  const ajvValid = ajv(doc);
  const zodResult = zod.safeParse(doc);
  return {
    verdict: { ajv: ajvValid, zod: zodResult.success },
    // Shown only when an assertion fails, so a disagreement names the rule on each side.
    detail: JSON.stringify({ ajv: ajv.errors ?? [], zod: zodResult.error?.issues ?? [] }, null, 2),
  };
}

function mutate<T>(base: T, change: (draft: T) => void): T {
  const draft = structuredClone(base);
  change(draft);
  return draft;
}

// Fictional documents (docs/WORKFLOW.md section 2): nothing here is a real product, brand or fact.
const PT: TextBlock = {
  tagline: 'Controlador fictício usado só nos testes de esquema.',
  summary: 'Texto fictício, longo o bastante para cumprir o mínimo de quarenta caracteres do resumo.',
  field_quirk: null,
  alt_text: 'Ilustração fictícia de um controlador genérico.',
  status: 'verified',
};
const EN: TextBlock = {
  tagline: 'Fictional controller used only by the schema tests.',
  summary: 'Fictional text, long enough to meet the forty character minimum of a summary.',
  field_quirk: null,
  alt_text: 'Fictional illustration of a generic controller.',
  status: 'verified',
};

const PUBLISHED: Exhibit = {
  id: 'fx-parity-controller',
  slug: 'fx-parity-controller',
  name: 'Parity Controller PC-1',
  manufacturer: 'Fixture Controls',
  current_owner: 'Fixture Controls',
  country_of_origin: null,
  category: 'plc',
  architecture: 'modular',
  sectors: ['discrete', 'process'],
  decade: '1980s',
  year_introduced: 1984,
  year_introduced_precision: 'exact',
  era_theme_override: null,
  specs: { cpu: null, languages: ['LD', 'SFC'] },
  lifecycle: { discontinued_year: null },
  images: [
    {
      file: 'content/images/fx-parity-controller/hero.svg',
      role: 'hero',
      meta: 'content/images/fx-parity-controller/hero.meta.json',
      is_illustration: true,
    },
  ],
  links: [{ type: 'manual', partner: null, label: 'Fictional manual', url: 'https://example.com/manual' }],
  sources: [{ id: 'src-fixture-manual', type: 'manual', title: 'Fictional manual for schema tests', accessed: '2026-10-14' }],
  verification: { level: 'verified', unverified_fields: [], reviewer: null, date: '2026-10-14', notes: null },
  text: { pt: PT, en: EN },
  review_status: 'published',
};

const STORY: FieldStory = {
  id: 'st-parity0001',
  exhibit_id: 'fx-parity-controller',
  display_name: 'Fixture Person P',
  role: null,
  country: 'BR',
  original_lang: 'en',
  year_of_memory: 1990,
  text: 'Fictional story for the schema tests, long enough to pass the forty character minimum.',
  consent: { publish_with_display_name: true, license: 'CC-BY-4.0', machine_translation: true },
  status: 'approved',
  submitted_at: '2026-10-01T12:00:00Z',
  approved_at: null,
  edited_note: null,
};

const META: ImageMeta = {
  file: 'content/images/fx-parity-controller/hero.svg',
  author: 'PLC Museum (original illustration)',
  license: 'original-illustration',
  source_url: null,
  attribution_text: 'Illustration: PLC Museum, CC BY 4.0',
  permission_evidence: null,
  modifications: ['none'],
  shows_logo: false,
  added: '2026-10-14',
};

type Case = { name: string; kind: Kind; doc: unknown; valid: boolean };

// RFC 3339 forms that Ajv's date-time format accepts and z.iso.datetime({ offset: true }) rejects; the schema
// pattern narrows Ajv to Zod's grammar.
const NARROWED_DATETIMES: [label: string, value: string][] = [
  ['offset without a colon', '2026-10-01T12:00:00+0300'],
  ['offset without minutes', '2026-10-01T12:00:00+03'],
  ['space separator', '2026-10-01 12:00:00Z'],
  ['lowercase t', '2026-10-01t12:00:00Z'],
  ['lowercase z', '2026-10-01T12:00:00z'],
  ['leap second 60', '2016-12-31T23:59:60Z'],
];

const DATETIME_CASES: Case[] = NARROWED_DATETIMES.flatMap(([label, value]) => [
  {
    name: `story submitted_at with ${label}`,
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.submitted_at = value;
    }),
    valid: false,
  },
  {
    name: `story approved_at with ${label}`,
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.approved_at = value;
    }),
    valid: false,
  },
]);

const CASES: Case[] = [
  // exhibits
  { name: 'published exhibit baseline', kind: 'exhibit', doc: PUBLISHED, valid: true },
  {
    name: 'draft exhibit with no sources, no images and unverified fields',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.review_status = 'draft';
      d.verification = { level: 'partial', unverified_fields: ['specs.cpu'] };
      d.sources = [];
      d.images = [];
      d.text = { pt: { ...PT, status: 'needs_review' } };
    }),
    valid: true,
  },
  {
    name: 'review exhibit with en status machine',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.review_status = 'review';
      d.text.en = { ...EN, status: 'machine' };
    }),
    valid: true,
  },
  {
    name: 'wrong decade enum',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => Object.assign(d, { decade: '1950s' })),
    valid: false,
  },
  {
    name: 'extra property at the root',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => Object.assign(d, { color: 'beige' })),
    valid: false,
  },
  {
    name: 'extra property in specs',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => Object.assign(d.specs, { color: 'beige' })),
    valid: false,
  },
  {
    name: 'extra property in a text block',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.text.pt = Object.assign({ ...PT }, { subtitle: 'not in the schema' });
    }),
    valid: false,
  },
  {
    name: 'bad slug',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.slug = 'Parity_Controller';
    }),
    valid: false,
  },
  {
    name: 'missing required field (current_owner)',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => Reflect.deleteProperty(d, 'current_owner')),
    valid: false,
  },
  {
    name: 'published without sources',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.sources = [];
    }),
    valid: false,
  },
  {
    name: 'published with unverified fields',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.verification.unverified_fields = ['specs.cpu'];
    }),
    valid: false,
  },
  {
    name: 'published with en status machine',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.text.en = { ...EN, status: 'machine' };
    }),
    valid: false,
  },
  {
    name: 'published without an en block',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.text = { pt: PT };
    }),
    valid: false,
  },
  {
    name: 'tagline at 120 characters',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.text.pt = { ...PT, tagline: 'x'.repeat(120) };
    }),
    valid: true,
  },
  {
    name: 'tagline at 121 characters',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.text.pt = { ...PT, tagline: 'x'.repeat(121) };
    }),
    valid: false,
  },
  {
    name: 'link with http://',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.links = [{ type: 'manual', label: 'Fictional manual', url: 'http://example.com/manual' }];
    }),
    valid: false,
  },
  {
    // The URL parser lowercases the scheme, so only the ^https:// pattern sees the difference.
    name: 'link with uppercase HTTPS://',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.links = [{ type: 'manual', label: 'Fictional manual', url: 'HTTPS://example.com/x' }];
    }),
    valid: false,
  },
  {
    // The URL parser reads "https:example.com" as https://example.com/.
    name: 'link with https: and no slashes',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.links = [{ type: 'manual', label: 'Fictional manual', url: 'https:example.com' }];
    }),
    valid: false,
  },
  {
    name: 'duplicate sectors',
    kind: 'exhibit',
    doc: mutate(PUBLISHED, (d) => {
      d.sectors = ['process', 'process'];
    }),
    valid: false,
  },
  // stories
  { name: 'story baseline', kind: 'story', doc: STORY, valid: true },
  {
    name: 'story with consent.publish_with_display_name false',
    kind: 'story',
    doc: mutate(STORY, (d) => Object.assign(d.consent, { publish_with_display_name: false })),
    valid: false,
  },
  {
    name: 'story id "st-x"',
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.id = 'st-x';
    }),
    valid: false,
  },
  {
    name: 'story submitted_at without timezone',
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.submitted_at = '2026-10-01T12:00:00';
    }),
    valid: false,
  },
  {
    name: 'story submitted_at with an offset',
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.submitted_at = '2026-10-01T12:00:00+02:00';
    }),
    valid: true,
  },
  {
    name: 'story approved_at with fractional seconds and a negative offset',
    kind: 'story',
    doc: mutate(STORY, (d) => {
      d.approved_at = '2026-10-02T08:30:15.250-03:00';
    }),
    valid: true,
  },
  ...DATETIME_CASES,
  // image meta
  { name: 'meta baseline', kind: 'meta', doc: META, valid: true },
  {
    name: 'meta permission-granted without evidence',
    kind: 'meta',
    doc: mutate(META, (d) => {
      d.license = 'permission-granted';
      d.permission_evidence = null;
    }),
    valid: false,
  },
  {
    name: 'meta permission-granted with evidence',
    kind: 'meta',
    doc: mutate(META, (d) => {
      d.license = 'permission-granted';
      d.permission_evidence = 'archive ref 2026-10 fixture';
    }),
    valid: true,
  },
  {
    name: 'meta file under src/assets/illustrations',
    kind: 'meta',
    doc: mutate(META, (d) => {
      d.file = 'src/assets/illustrations/rack-modular.svg';
    }),
    valid: true,
  },
  {
    name: 'meta file under src/other',
    kind: 'meta',
    doc: mutate(META, (d) => {
      d.file = 'src/other/rack-modular.svg';
    }),
    valid: false,
  },
];

describe('Ajv and Zod agree', () => {
  it.each(CASES)('$name', ({ kind, doc, valid }) => {
    const { verdict, detail } = judge(kind, doc);
    expect(verdict, detail).toEqual({ ajv: valid, zod: valid });
  });
});

describe('real content and fixtures are valid for both', () => {
  const exhibits = Object.entries(
    import.meta.glob<unknown>('/content/exhibits/*.json', { eager: true, import: 'default' }),
  );

  it('finds the exhibits', () => {
    expect(exhibits.length).toBeGreaterThan(0);
  });

  it.each(exhibits)('%s', (_path, doc) => {
    const { verdict, detail } = judge('exhibit', doc);
    expect(verdict, detail).toEqual({ ajv: true, zod: true });
  });

  it.each(fixtureStories.map((story): [string, FieldStory] => [story.id, story]))('fixture story %s', (_id, story) => {
    const { verdict, detail } = judge('story', story);
    expect(verdict, detail).toEqual({ ajv: true, zod: true });
  });
});

describe('enum options are identical', () => {
  const exhibitProps = exhibitJsonSchema.properties;
  const shape = exhibitSchema.shape;
  const ENUMS: [string, readonly unknown[], readonly unknown[]][] = [
    ['category', exhibitProps.category.enum, shape.category.options],
    ['architecture', exhibitProps.architecture.enum, shape.architecture.options],
    ['sectors', exhibitProps.sectors.items.enum, shape.sectors.unwrap().element.options],
    ['decade', exhibitJsonSchema.$defs.decade.enum, shape.decade.options],
    ['year precision', exhibitProps.year_introduced_precision.enum, shape.year_introduced_precision.options],
    [
      'languages',
      exhibitProps.specs.properties.languages.items.enum,
      shape.specs.shape.languages.unwrap().element.options,
    ],
    ['image role', exhibitProps.images.items.properties.role.enum, shape.images.element.shape.role.options],
    ['link type', exhibitProps.links.items.properties.type.enum, shape.links.unwrap().element.shape.type.options],
    ['source type', exhibitProps.sources.items.properties.type.enum, shape.sources.element.shape.type.options],
    ['verification level', exhibitProps.verification.properties.level.enum, shape.verification.shape.level.options],
    ['text status', exhibitJsonSchema.$defs.textBlock.properties.status.enum, textBlockSchema.shape.status.options],
    ['review status', exhibitProps.review_status.enum, shape.review_status.options],
    ['story original_lang', storyJsonSchema.properties.original_lang.enum, storySchema.shape.original_lang.options],
    ['license', imageMetaJsonSchema.properties.license.enum, imageMetaSchema.shape.license.options],
    [
      'modifications',
      imageMetaJsonSchema.properties.modifications.items.enum,
      imageMetaSchema.shape.modifications.element.options,
    ],
  ];

  it.each(ENUMS)('%s', (_name, json, zod) => {
    expect(zod).toEqual(json);
  });
});

describe('path patterns are identical', () => {
  // RegExp#source escapes "/" the same way on both sides, so equal sources mean equal patterns.
  const source = (pattern: string) => new RegExp(pattern).source;

  it('exhibit image file', () => {
    expect(source(exhibitJsonSchema.properties.images.items.properties.file.pattern)).toBe(IMAGE_FILE_PATTERN.source);
  });

  it('exhibit image meta', () => {
    expect(source(exhibitJsonSchema.properties.images.items.properties.meta.pattern)).toBe(IMAGE_META_PATTERN.source);
  });

  it('image meta file', () => {
    expect(source(imageMetaJsonSchema.properties.file.pattern)).toBe(META_FILE_PATTERN.source);
  });
});
