import type { CenterChangeDetail, ExhibitCard } from '../contracts';

export function wrapIndex(index: number, count: number): number {
  return count > 0 ? ((index % count) + count) % count : 0;
}

export function relativeOffset(index: number, center: number, count: number): number {
  const offset = wrapIndex(index - center, count);
  return offset > count / 2 ? offset - count : offset;
}

export function keyboardIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return wrapIndex(index - 1, count);
    case 'ArrowRight':
      return wrapIndex(index + 1, count);
    case 'Home':
      return 0;
    case 'End':
      return Math.max(0, count - 1);
    default:
      return null;
  }
}

/** Wait for the visual transition, then coalesce changes for the contract's 120 ms. */
export function settledChange(notify: (detail: CenterChangeDetail) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastId: string | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    schedule(card: Pick<ExhibitCard, 'id' | 'decade' | 'era'>, transitionMs = 0) {
      cancel();
      timer = setTimeout(() => {
        if (lastId === card.id) return;
        lastId = card.id;
        notify({ id: card.id, decade: card.decade, era: card.era });
      }, transitionMs + 120);
    },
    cancel,
  };
}
