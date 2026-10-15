// html[data-page-era] (ERA_HOOKS.page), written by Base.astro from each page: the era a page wears while Era UI is
// on. Against `astro dev` (project "pages"), where the draft sample exhibit is visible.
import { expect, test } from '@playwright/test';
import { ERA_HOOKS, STAGE_HOOKS } from '../../src/islands/contracts';

const PAGE_ERA = ERA_HOOKS.page;

for (const [decade, era] of [
  ['1980s', '1980s'],
  ['1960s', '1970s'],
  ['2010s', '2020s'],
] as const) {
  test(`the ${decade} decade page wears the ${era} era`, async ({ page }) => {
    await page.goto(`/en/decades/${decade}`);
    await expect(page.locator('html')).toHaveAttribute(PAGE_ERA, era);
  });
}

for (const path of ['/en/about', '/en/privacy']) {
  test(`${path} has no page era`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('html')).not.toHaveAttribute(PAGE_ERA);
  });
}

test('the home wears the era of the first stage item, or none without a stage', async ({ page }) => {
  await page.goto('/en/');
  const first = page.locator(`.${STAGE_HOOKS.list} .${STAGE_HOOKS.item}`).first();
  const html = page.locator('html');
  if ((await first.count()) === 0) {
    await expect(html).not.toHaveAttribute(PAGE_ERA);
    return;
  }
  await expect(html).toHaveAttribute(PAGE_ERA, (await first.getAttribute('data-era')) ?? '');
});

test('an exhibit page wears the era of its stage item', async ({ page }) => {
  await page.goto('/en/decades/1980s');
  const era = await page.locator(`.${STAGE_HOOKS.item}[data-id="ab-plc-5"]`).getAttribute('data-era');
  expect(era, 'ab-plc-5 on its decade page').toBeTruthy();
  await page.goto('/en/exhibits/ab-plc-5');
  await expect(page.locator('html')).toHaveAttribute(PAGE_ERA, era ?? '');
});

test('without a stored preference every page keeps the museum theme', async ({ page }) => {
  await page.goto('/en/decades/1980s');
  await expect(page.locator('html')).toHaveAttribute(ERA_HOOKS.applied, 'museum');
});
