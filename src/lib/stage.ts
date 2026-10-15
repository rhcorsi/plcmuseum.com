// Which exhibits a build may show (docs/CONTENT_GUIDE.md section 6): only published ones reach the public site,
// review ones appear on preview, drafts only on a developer machine.
import type { Exhibit } from '../content/types';

export const STAGES = ['production', 'preview', 'development'] as const;
export type Stage = (typeof STAGES)[number];

/** Resolves PLCMUSEUM_STAGE. Unset means development under `astro dev` and production for any build. */
export function resolveStage(value: string | undefined, isDev: boolean): Stage {
  if (value === undefined || value === '') return isDev ? 'development' : 'production';
  if ((STAGES as readonly string[]).includes(value)) return value as Stage;
  throw new Error(`PLCMUSEUM_STAGE must be one of ${STAGES.join(', ')}; got "${value}"`);
}

export function currentStage(): Stage {
  return resolveStage(import.meta.env.PLCMUSEUM_STAGE, import.meta.env.DEV);
}

export function isVisible(status: Exhibit['review_status'], stage: Stage): boolean {
  if (status === 'published') return true;
  if (status === 'review') return stage !== 'production';
  return stage === 'development';
}
