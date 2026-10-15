// TimelineScrubber fixtures (docs/tasks/TASK-004-timeline-scrubber.md): the fictional exhibits of ./exhibits.ts as
// timeline items in English, in the stage's order. Never real content.
import type { TimelineItem } from '../islands/contracts';
import { toTimelineItem } from '../lib/timeline';
import { fixtureExhibits } from './exhibits';

export const fixtureTimelineItems: TimelineItem[] = fixtureExhibits.map((card) => toTimelineItem(card, 'en'));
