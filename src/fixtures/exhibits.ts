// Fictional exhibits for component work, fixture pages and tests (docs/WORKFLOW.md section 2).
// Every name, manufacturer and tagline here is invented: none is a real product, brand or fact, and none of it
// is ever rendered on the public site. Real content comes from content/exhibits through src/lib/exhibit-card.ts.
import type { Decade, EraTheme, ExhibitCard, ExhibitImage } from '../islands/contracts';
import { yearLabelFor } from '../lib/exhibit-card';
import silhouetteUrl from './media/silhouette.svg?url';

/** A neutral placeholder "photo" (inline SVG data URI, allowed by the CSP img-src) with real dimensions. */
function placeholderImage(label: string, width = 640, height = 480): ExhibitImage {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#d9d9d9"/>` +
    `<rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="#8c8c8c" stroke-width="4"/>` +
    `<text x="50%" y="50%" font-family="sans-serif" font-size="32" fill="#4d4d4d" text-anchor="middle">${label}</text>` +
    `</svg>`;
  const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return { src, srcset: `${src} ${width}w`, width, height, credit: 'Fixture placeholder, not a real photograph' };
}

type Seed = {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  decade: Decade;
  era: EraTheme;
  yearPrecision?: ExhibitCard['yearPrecision'];
  tagline: string;
  alt: string;
  /** false: no licensed photo, so the card falls back to the silhouette. */
  photo?: boolean;
  /** Portrait or wide photos exercise aspect-ratio handling. */
  size?: [number, number];
};

const SEEDS: Seed[] = [
  {
    id: 'fx-relay-replacer-r1',
    name: 'Relay Replacer R1',
    manufacturer: 'Fixture Controls',
    year: 1969,
    decade: '1960s',
    era: '1970s',
    tagline: 'A fictional cabinet that pretends to retire a wall of relays.',
    alt: 'Gray placeholder rectangle standing in for a fictional controller photo.',
  },
  {
    id: 'fx-logic-cabinet-lc20',
    name: 'Logic Cabinet LC-20',
    manufacturer: 'Example Industrial',
    year: 1974,
    decade: '1970s',
    era: '1970s',
    yearPrecision: 'approximate',
    tagline: 'Fictional: the approximate year exercises the "approx." label.',
    alt: 'Line illustration of a generic controller cabinet with modules.',
    photo: false,
  },
  {
    id: 'fx-process-hiway-ph1',
    name: 'Process Hiway PH-1',
    manufacturer: 'Sample Process Systems',
    year: 1977,
    decade: '1970s',
    era: '1970s',
    tagline: 'A made-up distributed control system with a made-up data highway.',
    alt: 'Gray placeholder rectangle standing in for a fictional control room photo.',
    size: [800, 450],
  },
  {
    id: 'fx-octal-rack-or5',
    name: 'Octal Rack OR-5',
    manufacturer: 'Fixture Controls',
    year: 1984,
    decade: '1980s',
    era: '1980s',
    tagline: 'Fictional rack where nobody can find address 8 or 9.',
    alt: 'Gray placeholder rectangle standing in for a fictional rack photo.',
  },
  {
    id: 'fx-phosphor-terminal-pt80',
    name: 'Phosphor Terminal PT-80',
    manufacturer: 'Example Industrial',
    year: 1986,
    decade: '1980s',
    era: '1980s',
    yearPrecision: 'disputed',
    tagline: 'Fictional: a disputed year that the page must not show as exact.',
    alt: 'Gray placeholder rectangle standing in for a fictional programming terminal photo.',
    size: [480, 640],
  },
  {
    id: 'fx-multiloop-ml8',
    name: 'Multiloop ML-8',
    manufacturer: 'Sample Process Systems',
    year: 1989,
    decade: '1980s',
    era: '1980s',
    tagline: 'An invented eight-loop controller with a long name to test wrapping across the stage.',
    alt: 'Gray placeholder rectangle standing in for a fictional multiloop controller photo.',
  },
  {
    id: 'fx-bevel-station-bs95',
    name: 'Bevel Station BS-95',
    manufacturer: 'Example Industrial',
    year: 1993,
    decade: '1990s',
    era: '1990s',
    tagline: 'Fictional engineering station with gray bevelled windows.',
    alt: 'Line illustration of a generic operator console with a CRT monitor.',
    photo: false,
  },
  {
    id: 'fx-fieldbus-node-fn3',
    name: 'Fieldbus Node FN-3',
    manufacturer: 'Fixture Controls',
    year: 1997,
    decade: '1990s',
    era: '1990s',
    tagline: 'A pretend remote I/O node on a pretend fieldbus.',
    alt: 'Gray placeholder rectangle standing in for a fictional remote I/O photo.',
  },
  {
    id: 'fx-gloss-panel-gp2003',
    name: 'Gloss Panel GP-2003',
    manufacturer: 'Sample Process Systems',
    year: 2003,
    decade: '2000s',
    era: '2000s',
    tagline: 'Fictional glossy touch panel from the dark-metal decade.',
    alt: 'Gray placeholder rectangle standing in for a fictional touch panel photo.',
    size: [800, 450],
  },
  {
    id: 'fx-tag-engine-te7',
    name: 'Tag Engine TE-7',
    manufacturer: 'Example Industrial',
    year: 2008,
    decade: '2000s',
    era: '2000s',
    tagline: 'An imaginary controller that addresses everything by tag name.',
    alt: 'Gray placeholder rectangle standing in for a fictional controller photo.',
  },
  {
    id: 'fx-flat-hmi-fh12',
    name: 'Flat HMI FH-12',
    manufacturer: 'Fixture Controls',
    year: 2014,
    decade: '2010s',
    era: '2020s',
    tagline: 'Fictional high-performance HMI where color means alarm, nothing else.',
    alt: 'Gray placeholder rectangle standing in for a fictional HMI photo.',
  },
  {
    id: 'fx-edge-pac-ep21',
    name: 'Edge PAC EP-21',
    manufacturer: 'Sample Process Systems',
    year: 2021,
    decade: '2020s',
    era: '2020s',
    tagline: 'A made-up controller for the most recent decade on the stage.',
    alt: 'Gray placeholder rectangle standing in for a fictional edge controller photo.',
  },
];

export const fixtureExhibits: ExhibitCard[] = SEEDS.map((seed) => {
  const [width, height] = seed.size ?? [640, 480];
  const hasPhoto = seed.photo ?? true;
  return {
    id: seed.id,
    slug: seed.id,
    href: `/en/exhibits/${seed.id}`,
    name: seed.name,
    manufacturer: seed.manufacturer,
    year: seed.year,
    yearPrecision: seed.yearPrecision ?? 'exact',
    yearLabel: yearLabelFor('en', seed.year, seed.yearPrecision ?? 'exact'),
    decade: seed.decade,
    era: seed.era,
    tagline: seed.tagline,
    textLang: 'en',
    alt: seed.alt,
    image: hasPhoto ? placeholderImage(seed.name, width, height) : null,
    silhouette: hasPhoto ? null : `${silhouetteUrl}#art`,
  };
});

/** The exhibit the stage starts on in fixture pages (a 1980s item, so both directions have neighbors). */
export const fixtureInitialId = 'fx-octal-rack-or5';
