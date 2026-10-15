import { STORAGE_KEYS } from '../contracts';
import { ERA_THEMES, MUSEUM_ERA, type EraAttribute, type EraTheme } from '../../lib/era';

type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type AnnouncementCause = 'init' | 'click' | 'center' | 'pageshow';

export function parseEra(value: unknown): EraTheme | null {
  return (ERA_THEMES as readonly unknown[]).includes(value) ? (value as EraTheme) : null;
}

export function readEnabled(getStorage: StorageGetter): boolean | null {
  try {
    return getStorage().getItem(STORAGE_KEYS.eraUi) === '1';
  } catch {
    return null;
  }
}

export function writeEnabled(getStorage: StorageGetter, enabled: boolean): void {
  try {
    const storage = getStorage();
    if (enabled) storage.setItem(STORAGE_KEYS.eraUi, '1');
    else storage.removeItem(STORAGE_KEYS.eraUi);
  } catch {
    // A blocked preference store does not prevent changing the current page.
  }
}

export function resolveEra({
  enabled,
  centeredEra,
  pageEra,
}: {
  enabled: boolean;
  centeredEra: EraTheme | null;
  pageEra: EraTheme | null;
}): EraAttribute {
  return enabled ? (centeredEra ?? pageEra ?? MUSEUM_ERA) : MUSEUM_ERA;
}

/** null leaves the status untouched; an empty attribute name clears it. */
export function announcementAttribute(
  cause: AnnouncementCause,
  enabled: boolean,
  era: EraAttribute,
  changed: boolean,
): string | null {
  if (cause === 'click') return !enabled ? 'data-announce-off' : `data-announce-${era === MUSEUM_ERA ? 'no-era' : era}`;
  if (changed && (cause === 'pageshow' || (cause === 'center' && enabled))) return '';
  return null;
}
