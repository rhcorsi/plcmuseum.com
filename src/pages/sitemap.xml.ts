// sitemap.xml, built once at build time: every indexable page in every language, each with its hreflang
// alternates and x-default (docs/I18N.md). 404 pages, /dev fixtures and the root language chooser are left out.
import type { APIRoute } from 'astro';
import { getVisibleExhibits } from '../content/queries';
import { DECADES } from '../content/schemas';
import { DEFAULT_LANG, LANG_TAGS, LANGS, localizedPath } from '../i18n/utils';

const STATIC_PATHS = ['/', '/about', '/privacy', '/credits', '/contribute'];

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://plcmuseum.com');
  const url = (path: string) => escapeXml(new URL(path, base).href);
  const exhibits = await getVisibleExhibits();
  const paths = [
    ...STATIC_PATHS,
    ...DECADES.map((decade) => `/decades/${decade}`),
    ...exhibits.map((exhibit) => `/exhibits/${exhibit.slug}`),
  ];

  const entries = paths.flatMap((path) => {
    const alternates = [
      ...LANGS.map(
        (code) =>
          `<xhtml:link rel="alternate" hreflang="${LANG_TAGS[code]}" href="${url(localizedPath(code, path))}"/>`,
      ),
      `<xhtml:link rel="alternate" hreflang="x-default" href="${url(localizedPath(DEFAULT_LANG, path))}"/>`,
    ].join('');
    return LANGS.map((lang) => `<url><loc>${url(localizedPath(lang, path))}</loc>${alternates}</url>`);
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
