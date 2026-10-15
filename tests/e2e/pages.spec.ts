// Page structure against `astro dev` (Playwright project "pages"): drafts and /dev fixture pages are visible
// there, so the sample draft exhibit and the CoverFlow fixture can be checked before anything is published.
import { expect, type Page, test } from '@playwright/test';
import { LANG_TAGS, LANGS } from '../../src/i18n/langs';
import { ERA_THEMES } from '../../src/lib/era';

const STATIC_PAGES = ['about', 'privacy', 'credits', 'contribute'];

/** Collects console errors and uncaught page errors; every test ends by expecting none. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
}

for (const lang of LANGS) {
  test(`/${lang}/ home: language, era, alternates, one h1, skip link`, async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, `/${lang}/`);

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', LANG_TAGS[lang]);
    await expect(html).toHaveAttribute('data-era', 'museum');

    for (const code of LANGS) {
      await expect(page.locator(`head link[rel="alternate"][hreflang="${LANG_TAGS[code]}"]`)).toHaveCount(1);
    }
    await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', /\/en\/$/);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main');
    await expect(page.locator('main#main')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test(`/${lang}/ static pages return 200`, async ({ page }) => {
    const errors = trackErrors(page);
    for (const name of STATIC_PAGES) {
      await open(page, `/${lang}/${name}`);
      await expect(page.locator('h1')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
}

test('/en/exhibits/ab-plc-5 shows the draft notice and the illustration', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, '/en/exhibits/ab-plc-5');
  await expect(page.locator('h1')).toHaveText('PLC-5');
  await expect(page.locator('[data-review-status="draft"]')).toBeVisible();
  await expect(page.locator('svg use[href$="#art"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('/pt/decades/1980s lists the PLC-5', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, '/pt/decades/1980s');
  await expect(page.locator('.stage-item[data-id="ab-plc-5"]')).toContainText('PLC-5');
  expect(errors).toEqual([]);
});

test('/dev/coverflow renders the 12 fixtures, two of them as silhouettes', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, '/dev/coverflow');
  await expect(page.locator('.stage-list .stage-item')).toHaveCount(12);
  await expect(page.locator('.stage-list svg use')).toHaveCount(2);
  expect(errors).toEqual([]);
});

// STAGE_HOOKS: the link CoverFlow turns into the listbox option has a stable id, is named by name, maker and year,
// and is described by the tagline, so the option keeps a complete name without the island computing one.
test('/dev/coverflow stage links carry the ids, name and description of the contract', async ({ page }) => {
  await open(page, '/dev/coverflow');
  for (const item of await page.locator('.stage-list .stage-item').all()) {
    const id = await item.getAttribute('data-id');
    const part = async (kind: string) => ((await item.locator(`#stage-${kind}-${id}`).textContent()) ?? '').trim();
    const [name = '', maker = '', year = '', tagline = ''] = await Promise.all(
      ['name', 'maker', 'year', 'tagline'].map(part),
    );
    for (const text of [name, maker, year, tagline]) expect(text, `${id} part`).not.toBe('');
    const link = item.locator(`a.card#stage-link-${id}`);
    await expect(link).toHaveAccessibleName(`${name} ${maker} ${year}`);
    await expect(link).toHaveAccessibleDescription(tagline);
  }
});

test('/dev/coverflow?era=1980s switches the era theme', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page, '/dev/coverflow?era=1980s');
  await expect(page.locator('html')).toHaveAttribute('data-era', '1980s');
  expect(errors).toEqual([]);
});

// WCAG 1.4.10 and 1.4.12: at 320 px, with the text-spacing overrides, long words (German compounds) wrap instead of
// running out of their column, in the museum theme and in every era (after TASK-002 the 1980s theme is monospace
// throughout). The check measures the rendered glyphs of every text node against the content box of the nearest
// block that lays it out, so inline chains and display: contents wrappers (astro-island) neither hide nor fake an
// overflow, and it also asserts the page itself does not scroll sideways. Letter spacing is WCAG's 0.12em plus
// 0.06em, which stands in for the difference between a narrow system monospace (Consolas, about 0.55em per glyph) and
// the wider ones on other machines and in CI (Cascadia Mono, DejaVu Sans Mono, about 0.6em).
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.18em !important; word-spacing: 0.16em !important; }
  p { margin-block-end: 2em !important; }
`;

function measureOverflow() {
  const layoutBox = (start: Element | null): Element | null => {
    let element = start;
    while (element && ['contents', 'inline'].includes(getComputedStyle(element).display))
      element = element.parentElement;
    return element;
  };
  const scrollsOrHides = (start: Element | null): boolean => {
    for (let element = start; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (['auto', 'scroll'].includes(style.overflowX)) return true; // the decade bar scrolls on purpose
      if (style.clipPath !== 'none' || element.getBoundingClientRect().width <= 2) return true;
    }
    return false;
  };
  const contentRight = (box: Element) => {
    const style = getComputedStyle(box);
    return (
      box.getBoundingClientRect().right -
      Number.parseFloat(style.paddingRight) -
      Number.parseFloat(style.borderRightWidth)
    );
  };
  const spills = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || ['SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
    if (scrollsOrHides(parent)) continue;
    const box = layoutBox(parent);
    if (!box) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    if (rects.length === 0) continue;
    const name = `${box.tagName.toLowerCase()}.${box.className}`;
    // Glyphs past the box that lays them out.
    const textRight = Math.max(...rects.map((rect) => rect.right));
    if (textRight > contentRight(box) + 1)
      spills.add(
        `${name} "${node.textContent.trim().slice(0, 24)}": ${Math.round(textRight)} > ${Math.round(contentRight(box))}`,
      );
    // That box pushed past its own column, which a long word does to grid and flex items through their min-content.
    const column = layoutBox(box.parentElement);
    if (column && box.getBoundingClientRect().right > contentRight(column) + 1)
      spills.add(`${name} box: ${Math.round(box.getBoundingClientRect().right)} > ${Math.round(contentRight(column))}`);
  }
  const page = document.scrollingElement ?? document.documentElement;
  if (page.scrollWidth > window.innerWidth)
    spills.add(`page scrolls sideways: ${page.scrollWidth} > ${window.innerWidth}`);
  return [...spills];
}

for (const lang of LANGS) {
  test(`/${lang}/ text stays in its column at 320 px with text spacing, in every era`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const paths = ['', ...STATIC_PAGES, 'decades/1980s', 'exhibits/ab-plc-5'].map((path) => `/${lang}/${path}`);
    const overflowing: string[] = [];
    for (const path of paths) {
      await open(page, path);
      await page.addStyleTag({ content: TEXT_SPACING });
      for (const era of ['museum', ...ERA_THEMES]) {
        await page.evaluate((value) => (document.documentElement.dataset.era = value), era);
        overflowing.push(...(await page.evaluate(measureOverflow)).map((spill) => `${path} [${era}] ${spill}`));
      }
    }
    expect(overflowing).toEqual([]);
  });

  // overflow-wrap: anywhere (global.css) lets short labels in flex rows break mid-word unless they opt out.
  test(`/${lang}/ decade bar caption stays on one line on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, `/${lang}/`);
    const lines = await page
      .locator('.caption')
      .first()
      .evaluate((caption) => {
        const range = document.createRange();
        range.selectNodeContents(caption);
        return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)))
          .size;
      });
    expect(lines).toBe(1);
  });
}
