import { isLang } from '../../i18n/langs';
import { STORAGE_KEYS } from '../contracts';

export function rememberLanguage(getStorage: () => Pick<Storage, 'setItem'>, value: unknown): void {
  if (!isLang(value)) return;
  try {
    getStorage().setItem(STORAGE_KEYS.lang, value);
  } catch {
    // The ordinary link remains usable when preferences cannot be saved.
  }
}
