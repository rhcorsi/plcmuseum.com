// Ajv validators compiled from content/schema exactly as scripts/validate-content.mjs compiles them, so these tests
// judge documents by the same rules as the content gate.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import exhibitJsonSchema from '../../content/schema/exhibit.schema.json';
import imageMetaJsonSchema from '../../content/schema/image-meta.schema.json';
import storyJsonSchema from '../../content/schema/story.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

export const ajvExhibit = ajv.compile(exhibitJsonSchema);
export const ajvStory = ajv.compile(storyJsonSchema);
export const ajvImageMeta = ajv.compile(imageMetaJsonSchema);

export { exhibitJsonSchema, imageMetaJsonSchema, storyJsonSchema };
