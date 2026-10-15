// Astro content collections over the data layer in content/ (dependencies point inward: content knows nothing
// about src). Schemas are the Zod mirror of content/schema/*.json, see ./content/schemas.ts.
import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { exhibitSchema, glossaryTermSchema, storySchema } from './content/schemas';

const exhibits = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/exhibits' }),
  schema: exhibitSchema,
});

// Approved stories exist only in the gitignored cache that `pnpm stories:fetch` writes at deploy time
// (ADR-0008). Without it the collection is empty; see src/content/queries.ts for the fixture fallback rule.
const stories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './content/stories' }),
  schema: storySchema,
});

const glossary = defineCollection({
  loader: file('content/glossary.json', {
    // Keys starting with "_" are file comments, not terms.
    parser: (text) => {
      const terms = Object.entries(JSON.parse(text) as Record<string, Record<string, unknown>>);
      return Object.fromEntries(terms.filter(([key]) => !key.startsWith('_')));
    },
  }),
  schema: glossaryTermSchema,
});

export const collections = { exhibits, stories, glossary };
