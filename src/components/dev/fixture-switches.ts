// Applies ?era= and ?theme= on fixture pages (docs/DESIGN_SYSTEM.md section 7). Astro strips the query string from
// prerendered pages, under `astro dev` too, so this runs in the browser; Astro bundles it into an external module
// (CSP script-src 'self'). Only allowlisted values reach <html>: the eras Base.astro accepts and the two forced schemes.
import { isEraAttribute, MUSEUM_ERA } from '../../lib/era';

const query = new URLSearchParams(window.location.search);
const eraParam = query.get('era');
const era = isEraAttribute(eraParam) ? eraParam : MUSEUM_ERA;
const themeParam = query.get('theme');
const theme = themeParam === 'light' || themeParam === 'dark' ? themeParam : 'os';

const root = document.documentElement;
root.dataset.era = era;
if (theme === 'os') delete root.dataset.theme;
else root.dataset.theme = theme;

for (const link of document.querySelectorAll<HTMLAnchorElement>('.fixture-switch__link')) {
  if (link.dataset.targetEra === era && link.dataset.targetTheme === theme) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
}

const eraLabel = document.querySelector('[data-current="era"]');
const themeLabel = document.querySelector('[data-current="theme"]');
if (eraLabel) eraLabel.textContent = era;
if (themeLabel) themeLabel.textContent = theme === 'os' ? 'OS preference' : theme;
