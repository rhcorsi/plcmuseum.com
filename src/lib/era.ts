// Era UI (docs/ARCHITECTURE.md section 8): <html data-era> selects a theme in src/styles/themes/.
// "museum" is the default theme from tokens.css (Era UI off); the five eras cover the seven decades.
import type { Decade } from '../content/types';

export const ERA_THEMES = ['1970s', '1980s', '1990s', '2000s', '2020s'] as const;
export type EraTheme = (typeof ERA_THEMES)[number];

/** Value of `html[data-era]`: always present, "museum" while Era UI is off. */
export type EraAttribute = 'museum' | EraTheme;
export const MUSEUM_ERA: EraAttribute = 'museum';

// There is no 1960s or 2010s theme: the Modicon 084 era reads as the 1970s panel, the 2010s as modern HMI.
const ERA_BY_DECADE: Record<Decade, EraTheme> = {
  '1960s': '1970s',
  '1970s': '1970s',
  '1980s': '1980s',
  '1990s': '1990s',
  '2000s': '2000s',
  '2010s': '2020s',
  '2020s': '2020s',
};

/** Theme for an exhibit: its `era_theme_override` decade when set, otherwise its own decade. */
export function eraForDecade(decade: Decade, override?: Decade | null): EraTheme {
  return ERA_BY_DECADE[override ?? decade];
}

export function isEraAttribute(value: unknown): value is EraAttribute {
  return value === MUSEUM_ERA || (ERA_THEMES as readonly unknown[]).includes(value);
}
