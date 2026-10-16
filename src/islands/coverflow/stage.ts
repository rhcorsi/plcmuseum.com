import { EXHIBIT_SELECT_EVENT, STAGE_HOOKS, type ExhibitCard } from '../contracts';
import { keyboardIndex, relativeOffset, settledChange, transitionDurationMs, wrapIndex } from './navigation';

type StageOptions = {
  list: HTMLElement;
  controls?: HTMLElement | null;
  exhibits: ExhibitCard[];
  initialId: string;
  onActive: (card: ExhibitCard) => void;
  onSettled: (card: ExhibitCard, announce: boolean) => void;
  onEnhanced: (enhanced: boolean) => void;
};

export function enhanceStage({ list, controls, exhibits, initialId, onActive, onSettled, onEnhanced }: StageOptions) {
  const items = Array.from(list.querySelectorAll<HTMLElement>(`.${STAGE_HOOKS.item}`));
  const links = items.map((item) => item.querySelector<HTMLAnchorElement>('a.card'));
  // A mismatched server list remains usable instead of enhancing the wrong exhibits.
  if (
    !exhibits.length ||
    items.length !== exhibits.length ||
    items.some((item, i) => item.dataset.id !== exhibits[i]?.id || !links[i])
  ) {
    return { move: (_step: number) => {}, destroy: () => {} };
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let center = Math.max(
    0,
    exhibits.findIndex((card) => card.id === initialId),
  );
  let enhanced = false;
  let wheelDistance = 0;
  let wheelTime = 0;
  let wheelLocked = false;
  let swipe: { id: number; x: number; y: number } | undefined;
  let suppressClick = false;
  let announceCenter = false;
  let initialized = false;
  let previousCenter = center;
  // Unparked items: the window (center plus or minus 2) and the items still fading out after leaving it.
  let visible = new Set<number>();
  const leaving = new Map<number, ReturnType<typeof setTimeout>>();
  const offsets = new Map<number, number>();
  const frames = new Set<number>();
  const notifications = settledChange(({ id }, announce) => {
    const card = exhibits.find((entry) => entry.id === id);
    if (card) {
      list.dataset.centerId = card.id;
      onSettled(card, announce);
    }
  });

  const attributes = [list, ...items, ...links]
    .filter((element): element is HTMLElement => element !== null)
    .map((element) => ({
      element,
      values: [
        'role',
        'tabindex',
        'aria-activedescendant',
        'aria-selected',
        'aria-orientation',
        'aria-posinset',
        'aria-setsize',
      ].map((name) => [name, element.getAttribute(name)] as const),
    }));

  function restore() {
    for (const frame of frames) cancelAnimationFrame(frame);
    frames.clear();
    for (const timer of leaving.values()) clearTimeout(timer);
    leaving.clear();
    visible.clear();
    offsets.clear();
    list.classList.remove('is-coverflow', 'is-initializing');
    for (const { element, values } of attributes) {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
    for (const item of items) {
      item.classList.remove('is-center', 'is-near', 'is-parked', 'is-jumping');
      for (const name of ['offset', 'distance', 'direction', 'order']) item.style.removeProperty(`--coverflow-${name}`);
      if (item.getAttribute('style') === '') item.removeAttribute('style');
    }
  }

  function afterPaint(callback: () => void) {
    const first = requestAnimationFrame(() => {
      frames.delete(first);
      const second = requestAnimationFrame(() => {
        frames.delete(second);
        callback();
      });
      frames.add(second);
    });
    frames.add(first);
  }

  /** `fadeMs`: how long an item that leaves the window now may still be fading, before it is parked. */
  function paint(fadeMs = 0) {
    const card = exhibits[center];
    const activeLink = links[center];
    if (!card || !activeLink) return;
    onActive(card);
    if (!enhanced) return;
    list.setAttribute('aria-activedescendant', activeLink.id);
    links[previousCenter]?.setAttribute('aria-selected', 'false');
    activeLink.setAttribute('aria-selected', 'true');
    previousCenter = center;
    const nextWindow = new Set([-2, -1, 0, 1, 2].map((step) => wrapIndex(center + step, items.length)));
    // Only the old and new neighbors can change. Parked cards receive no repeated DOM writes.
    for (const index of new Set([...visible, ...nextWindow])) {
      const item = items[index];
      if (!item) continue;
      const inWindow = nextWindow.has(index);
      // Already fading out at its outer slot: nothing changes for it until it is parked or comes back.
      if (!inWindow && leaving.has(index)) continue;
      const previousOffset = offsets.get(index);
      const relative = relativeOffset(index, center, items.length);
      // Parking at once would hide a card in the middle of its fade on every step of a held arrow key, so an item
      // leaving the window stays unparked and transparent at the outer slot on the side it left from, and is parked
      // once its fade is over, unless it came back into the window by then.
      const offset = inWindow ? Math.max(-2, Math.min(2, relative)) : 2 * Math.sign(previousOffset || relative);
      const near = Math.abs(offset) <= 1;
      const jumping = !visible.has(index) || (previousOffset !== undefined && Math.abs(previousOffset - offset) > 1);
      item.classList.toggle('is-jumping', jumping);
      if (jumping) afterPaint(() => item.classList.remove('is-jumping'));
      item.classList.toggle('is-center', offset === 0);
      item.classList.toggle('is-near', near);
      item.classList.toggle('is-parked', false);
      item.style.setProperty('--coverflow-offset', String(offset));
      item.style.setProperty('--coverflow-distance', String(Math.abs(offset)));
      item.style.setProperty('--coverflow-direction', String(Math.sign(offset)));
      item.style.setProperty('--coverflow-order', String(2 - Math.abs(offset)));
      offsets.set(index, offset);
      if (inWindow) {
        clearTimeout(leaving.get(index));
        leaving.delete(index);
      } else {
        leaving.set(
          index,
          setTimeout(() => park(index), fadeMs),
        );
      }
    }
    visible = new Set([...nextWindow, ...leaving.keys()]);
  }

  function park(index: number) {
    if (!leaving.delete(index)) return;
    visible.delete(index);
    items[index]?.classList.toggle('is-parked', true);
  }

  function select(index: number, announce = false) {
    const next = wrapIndex(index, exhibits.length);
    if (next === center) return;
    center = next;
    announceCenter = announce;
    // The resolved --motion-stage, never an item's transition-duration, which is 0s while that item jumps.
    const duration = enhanced ? transitionDurationMs(getComputedStyle(list).getPropertyValue('--motion-stage')) : 0;
    paint(duration);
    const card = exhibits[center];
    if (!card) return;
    notifications.schedule(card, duration, announce);
  }

  function setMotion() {
    const focused = document.activeElement;
    const hadFocus = !!focused && (list.contains(focused) || !!controls?.contains(focused));
    const focusedLink = links.findIndex((link) => link === focused);
    notifications.cancel();
    restore();
    enhanced = !reducedMotion.matches;
    wheelDistance = 0;
    wheelLocked = false;
    swipe = undefined;
    suppressClick = false;
    if (enhanced) {
      if (focusedLink >= 0) {
        center = focusedLink;
        announceCenter = false;
      }
      list.classList.add('is-coverflow', 'is-initializing');
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-orientation', 'horizontal');
      list.tabIndex = 0;
      items.forEach((item, index) => {
        item.classList.add('is-parked');
        item.setAttribute('role', 'none');
        const link = links[index];
        if (link) {
          link.setAttribute('role', 'option');
          link.setAttribute('aria-selected', 'false');
          link.setAttribute('aria-posinset', String(index + 1));
          link.setAttribute('aria-setsize', String(items.length));
          link.tabIndex = -1;
        }
      });
      afterPaint(() => list.classList.remove('is-initializing'));
    }
    paint();
    onEnhanced(enhanced);
    if (hadFocus) {
      if (enhanced) list.focus({ preventScroll: true });
      else {
        links[center]?.focus({ preventScroll: true });
        items[center]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    }
    const card = exhibits[center];
    if (card) {
      if (initialized) notifications.schedule(card, 0, announceCenter);
      else {
        initialized = true;
        notifications.initial(card);
      }
    }
  }

  function onFocusIn(event: FocusEvent) {
    if (enhanced && links.some((link) => link === event.target)) list.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!enhanced || event.altKey || event.ctrlKey || event.metaKey) return;
    suppressClick = false;
    if (event.key === 'Enter') {
      event.preventDefault();
      links[center]?.click();
      return;
    }
    const next = keyboardIndex(event.key, center, exhibits.length);
    if (next === null) return;
    event.preventDefault();
    select(next);
  }

  function onClick(event: MouseEvent) {
    if (!enhanced || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    const item = event.target instanceof Element ? event.target.closest<HTMLElement>(`.${STAGE_HOOKS.item}`) : null;
    const index = item ? items.indexOf(item) : -1;
    if (index < 0 || index === center) return;
    event.preventDefault();
    select(index);
    list.focus({ preventScroll: true });
  }

  function onWheel(event: WheelEvent) {
    // Keep vertical scrolling and browser pinch zoom native; one step per horizontal gesture.
    if (!enhanced || event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (event.timeStamp - wheelTime > 160 || Math.sign(wheelDistance) !== Math.sign(event.deltaX)) {
      wheelDistance = 0;
      wheelLocked = false;
    }
    wheelTime = event.timeStamp;
    if (wheelLocked) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientWidth : 1;
    wheelDistance += event.deltaX * unit;
    if (Math.abs(wheelDistance) < 40) return;
    select(center + Math.sign(wheelDistance), true);
    wheelLocked = true;
  }

  function onPointerDown(event: PointerEvent) {
    if (!enhanced || !event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    const x = event.clientX - swipe.x;
    const y = event.clientY - swipe.y;
    swipe = undefined;
    if (Math.abs(x) < 40 || Math.abs(x) <= Math.abs(y)) return;
    suppressClick = true;
    select(center - Math.sign(x), true);
  }

  function cancelPointer() {
    swipe = undefined;
  }

  function onSelect(event: DocumentEventMap[typeof EXHIBIT_SELECT_EVENT]) {
    const index = exhibits.findIndex((card) => card.id === event.detail?.id);
    if (index < 0) return;
    select(index);
    if (!enhanced) {
      items[index]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }

  list.addEventListener('keydown', onKeyDown);
  list.addEventListener('focusin', onFocusIn);
  list.addEventListener('click', onClick);
  list.addEventListener('wheel', onWheel, { passive: false });
  list.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelPointer);
  reducedMotion.addEventListener('change', setMotion);
  document.addEventListener(EXHIBIT_SELECT_EVENT, onSelect);
  setMotion();

  return {
    move: (step: number) => select(center + step, true),
    destroy() {
      notifications.cancel();
      restore();
      delete list.dataset.centerId;
      list.removeEventListener('keydown', onKeyDown);
      list.removeEventListener('focusin', onFocusIn);
      list.removeEventListener('click', onClick);
      list.removeEventListener('wheel', onWheel);
      list.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', cancelPointer);
      reducedMotion.removeEventListener('change', setMotion);
      document.removeEventListener(EXHIBIT_SELECT_EVENT, onSelect);
    },
  };
}
