// TimelineScrubber props for one page language (src/islands/contracts.ts): items from the stage's cards and the
// strings the island needs, resolved here so the island never ships the dictionaries. Server only.
import { DECADES } from '../content/schemas';
import type { Decade } from '../content/types';
import { type Lang, t } from '../i18n/utils';
import type { ExhibitCard, TimelineItem, TimelineScrubberProps } from '../islands/contracts';

/**
 * One stage card as the scrubber sees it. `card` must be resolved for the same page language as `lang`
 * (toExhibitCard(exhibit, lang)): its yearLabel is already localized and goes into valueText as is.
 */
export function toTimelineItem(card: ExhibitCard, lang: Lang): TimelineItem {
  return {
    id: card.id,
    yearLabel: card.yearLabel,
    name: card.name,
    decade: card.decade,
    valueText: t(lang, 'timeline.value', { name: card.name, maker: card.manufacturer, year: card.yearLabel }),
  };
}

export function timelineLabels(lang: Lang): TimelineScrubberProps['labels'] {
  const decades = Object.fromEntries(DECADES.map((decade) => [decade, t(lang, `decade.${decade}`)]));
  return { label: t(lang, 'timeline.label'), decades: decades as Record<Decade, string> };
}
