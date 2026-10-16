import { LANGUAGE_HOOKS } from '../contracts';
import { rememberLanguage } from './remember';

const nav = document.querySelector<HTMLElement>(`.${LANGUAGE_HOOKS.nav}`);

if (nav) {
  nav.addEventListener('click', (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    const link =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(`a[${LANGUAGE_HOOKS.lang}]`) : null;
    if (link && nav.contains(link)) rememberLanguage(() => window.localStorage, link.getAttribute(LANGUAGE_HOOKS.lang));
  });
  nav.setAttribute(LANGUAGE_HOOKS.ready, '');
}
