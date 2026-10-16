import type { Page } from '@playwright/test';
import { ERA_CHANGE_EVENT, ERA_HOOKS, ERA_TOGGLE_HOOKS, type EraChangeDetail } from '../../../src/islands/contracts';

export type HeaderControlsRecording = {
  events: { detail: EraChangeDetail; era: string | null; ready: boolean }[];
  writes: { oldValue: string | null; era: string | null }[];
  transitions: { propertyName: string }[];
};

declare global {
  interface Window {
    headerControlsTest: HeaderControlsRecording;
    flushHeaderControlWrites: () => void;
    headerControlsPrefsStub?: boolean;
  }
}

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Seed only after a same-origin navigation, then exercise the returning-visitor path. */
export async function seedStorage(page: Page, key: string, value: string | null): Promise<void> {
  await page.evaluate(
    ({ key, value }) => {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    },
    { key, value },
  );
  await page.reload();
}

export async function failStorage(page: Page, variant: 'getter' | 'methods'): Promise<void> {
  await page.addInitScript((variant) => {
    const blocked = () => {
      throw new DOMException('Storage is disabled for this test', 'SecurityError');
    };
    if (variant === 'getter') {
      Object.defineProperty(window, 'localStorage', { configurable: true, get: blocked });
    } else {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Object.defineProperty(Storage.prototype, method, { configurable: true, value: blocked });
      }
    }
  }, variant);
}

/**
 * Replaces /prefs.js with a script that only marks its document, so prefsStubRan() proves the stub, not the real
 * file, ran there: a glob that stopped matching would otherwise leave every "stubbed" test green. astro dev serves
 * /prefs.js, a build serves it as /_astro/prefs.<hash>.js (astro.config.mjs).
 */
export async function stubPrefs(page: Page): Promise<void> {
  const body = 'window.headerControlsPrefsStub = true;';
  for (const url of ['**/prefs.js', '**/_astro/prefs.*.js'])
    await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body }));
}

export async function prefsStubRan(page: Page): Promise<boolean> {
  return page.evaluate(() => window.headerControlsPrefsStub === true);
}

export async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript(
    ({ eventName, applied, root, ready }) => {
      const recording: HeaderControlsRecording = { events: [], writes: [], transitions: [] };
      window.headerControlsTest = recording;
      document.addEventListener(eventName, (event) => {
        recording.events.push({
          detail: (event as CustomEvent<EraChangeDetail>).detail,
          era: document.documentElement.getAttribute(applied),
          ready: document.querySelector(`.${root}`)?.hasAttribute(ready) ?? false,
        });
      });
      const recordWrites = (records: MutationRecord[]) => {
        for (const record of records) {
          if (record.target === document.documentElement) {
            recording.writes.push({ oldValue: record.oldValue, era: document.documentElement.getAttribute(applied) });
          }
        }
      };
      const observer = new MutationObserver(recordWrites);
      // Observe the document before the parser creates <html>, including same-value attribute writes.
      observer.observe(document, { subtree: true, attributeFilter: [applied], attributeOldValue: true });
      window.flushHeaderControlWrites = () => recordWrites(observer.takeRecords());
      document.addEventListener('transitionrun', (event) => {
        if (event.target instanceof Element && event.target.matches('.era-toggle__thumb')) {
          recording.transitions.push({ propertyName: event.propertyName });
        }
      });
    },
    {
      eventName: ERA_CHANGE_EVENT,
      applied: ERA_HOOKS.applied,
      root: ERA_TOGGLE_HOOKS.root,
      ready: ERA_TOGGLE_HOOKS.ready,
    },
  );
}

export async function readRecorder(page: Page): Promise<HeaderControlsRecording> {
  return page.evaluate(() => {
    window.flushHeaderControlWrites();
    return window.headerControlsTest;
  });
}

/** Resolve a token through the CSS property that consumes it, including rem, colors and calc(). */
export async function resolveToken(page: Page, token: string, property: string): Promise<string> {
  return page.evaluate(
    ({ token, property }) => {
      const probe = document.createElement('span');
      probe.style.setProperty(property, `var(${token})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    },
    { token, property },
  );
}

export async function resolveDuration(page: Page, token: string): Promise<number> {
  const value = await resolveToken(page, token, 'transition-duration');
  return Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
}
