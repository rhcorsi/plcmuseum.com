import { STORAGE_KEYS } from '../contracts';
import { ERA_THEMES, MUSEUM_ERA, type EraAttribute, type EraTheme } from '../../lib/era';

type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type AnnouncementCause = 'click' | 'center' | 'pageshow';

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

/**
 * The attribute holding what the status says after a change main.ts applied; an empty name clears the status. Only
 * the visitor's click is spoken. main.ts never calls this when nothing changed (a stage event while off or with the
 * same era, init, an unchanged or failed resync), so those leave the status untouched.
 */
export function announcementAttribute(cause: AnnouncementCause, enabled: boolean, era: EraAttribute): string {
  if (cause !== 'click') return '';
  return enabled ? `data-announce-${era === MUSEUM_ERA ? 'no-era' : era}` : 'data-announce-off';
}
