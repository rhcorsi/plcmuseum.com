import { CENTER_CHANGE_EVENT, ERA_CHANGE_EVENT, ERA_HOOKS, ERA_TOGGLE_HOOKS } from '../contracts';
import { MUSEUM_ERA, type EraAttribute, type EraTheme } from '../../lib/era';
import { announcementAttribute, parseEra, readEnabled, resolveEra, writeEnabled } from './state';

const root = document.querySelector<HTMLElement>(`.${ERA_TOGGLE_HOOKS.root}`);
const button = root?.querySelector<HTMLButtonElement>('.era-toggle__button');
const status = root?.querySelector<HTMLElement>('.era-toggle__status');

if (root && button && status) {
  const html = document.documentElement;
  const getStorage = () => window.localStorage;
  const pageEra = parseEra(html.getAttribute(ERA_HOOKS.page));
  let enabled = readEnabled(getStorage) ?? false;
  let centeredEra: EraTheme | null = null;
  let appliedEra: EraAttribute = MUSEUM_ERA;

  function applyEra() {
    appliedEra = resolveEra({ enabled, centeredEra, pageEra });
    if (html.getAttribute(ERA_HOOKS.applied) !== appliedEra) html.setAttribute(ERA_HOOKS.applied, appliedEra);
  }

  function dispatch() {
    document.dispatchEvent(new CustomEvent(ERA_CHANGE_EVENT, { detail: { enabled, era: appliedEra } }));
  }

  function updateStatus(cause: 'click' | 'center' | 'pageshow') {
    const attribute = announcementAttribute(cause, enabled, appliedEra);
    status!.textContent = attribute ? (root!.getAttribute(attribute) ?? '') : '';
  }

  button.addEventListener('click', () => {
    root.setAttribute('data-animate', '');
    enabled = !enabled;
    writeEnabled(getStorage, enabled);
    applyEra();
    button.setAttribute('aria-checked', String(enabled));
    dispatch();
    updateStatus('click');
  });

  document.addEventListener(CENTER_CHANGE_EVENT, (event) => {
    const era = parseEra(event.detail?.era);
    if (!era) return;
    centeredEra = era;
    if (!enabled || era === appliedEra) return;
    applyEra();
    dispatch();
    updateStatus('center');
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const stored = readEnabled(getStorage);
    if (stored === null || stored === enabled) return;
    root.removeAttribute('data-animate');
    enabled = stored;
    applyEra();
    button.setAttribute('aria-checked', String(enabled));
    dispatch();
    updateStatus('pageshow');
  });

  applyEra();
  button.setAttribute('aria-checked', String(enabled));
  dispatch();
  root.setAttribute(ERA_TOGGLE_HOOKS.ready, '');
}
