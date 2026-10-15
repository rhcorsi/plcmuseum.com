import { EXHIBIT_SELECT_EVENT, STAGE_HOOKS, type ExhibitCard } from '../contracts';
import { keyboardIndex, relativeOffset, settledChange, wrapIndex } from './navigation';

type StageOptions = {
  list: HTMLElement;
  exhibits: ExhibitCard[];
  initialId: string;
  onActive: (card: ExhibitCard) => void;
  onSettled: (card: ExhibitCard) => void;
  onEnhanced: (enhanced: boolean) => void;
};

export function enhanceStage({ list, exhibits, initialId, onActive, onSettled, onEnhanced }: StageOptions) {
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
  const notifications = settledChange(({ id }) => {
    const card = exhibits.find((entry) => entry.id === id);
    if (card) onSettled(card);
  });

  const attributes = [list, ...items, ...links]
    .filter((element): element is HTMLElement => element !== null)
    .map((element) => ({
      element,
      values: ['role', 'tabindex', 'aria-activedescendant', 'aria-selected', 'aria-label', 'aria-orientation'].map(
        (name) => [name, element.getAttribute(name)] as const,
      ),
    }));

  function restore() {
    list.classList.remove('is-coverflow');
    for (const { element, values } of attributes) {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
    for (const item of items) {
      item.classList.remove('is-center', 'is-near');
      for (const name of ['offset', 'distance', 'direction', 'order']) item.style.removeProperty(`--coverflow-${name}`);
      if (!item.style.length) item.removeAttribute('style');
    }
  }

  function paint() {
    const card = exhibits[center];
    const activeItem = items[center];
    if (!card || !activeItem) return;
    onActive(card);
    if (!enhanced) return;
    list.setAttribute('aria-activedescendant', activeItem.id);
    for (const [index, item] of items.entries()) {
      const offset = relativeOffset(index, center, items.length);
      item.classList.toggle('is-center', offset === 0);
      item.classList.toggle('is-near', Math.abs(offset) <= 1);
      item.setAttribute('aria-selected', String(offset === 0));
      item.style.setProperty('--coverflow-offset', String(offset));
      item.style.setProperty('--coverflow-distance', String(Math.abs(offset)));
      item.style.setProperty('--coverflow-direction', String(Math.sign(offset)));
      item.style.setProperty('--coverflow-order', String(items.length - Math.abs(offset)));
    }
  }

  function select(index: number) {
    const next = wrapIndex(index, exhibits.length);
    if (next === center) return;
    center = next;
    paint();
    const card = exhibits[center];
    const item = items[center];
    if (!card || !item) return;
    const duration = enhanced
      ? getComputedStyle(item)
          .transitionDuration.split(',')
          .reduce((longest, value) => {
            const milliseconds = parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
            return Math.max(longest, milliseconds || 0);
          }, 0)
      : 0;
    notifications.schedule(card, duration);
  }

  function setMotion() {
    const hadFocus = document.activeElement === list;
    notifications.cancel();
    restore();
    enhanced = !reducedMotion.matches;
    wheelDistance = 0;
    wheelLocked = false;
    swipe = undefined;
    suppressClick = false;
    if (enhanced) {
      list.classList.add('is-coverflow');
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-orientation', 'horizontal');
      list.tabIndex = 0;
      items.forEach((item, index) => {
        item.setAttribute('role', 'option');
        item.setAttribute('aria-label', exhibits[index]?.name ?? '');
        const link = links[index];
        if (link) link.tabIndex = -1;
      });
    } else if (hadFocus) links[center]?.focus({ preventScroll: true });
    paint();
    onEnhanced(enhanced);
    const card = exhibits[center];
    if (card) notifications.schedule(card);
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
    select(center + Math.sign(wheelDistance));
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
    select(center - Math.sign(x));
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
      links[index]?.focus({ preventScroll: true });
    }
  }

  setMotion();
  list.addEventListener('keydown', onKeyDown);
  list.addEventListener('click', onClick);
  list.addEventListener('wheel', onWheel, { passive: false });
  list.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelPointer);
  reducedMotion.addEventListener('change', setMotion);
  document.addEventListener(EXHIBIT_SELECT_EVENT, onSelect);

  return {
    move: (step: number) => select(center + step),
    destroy() {
      notifications.cancel();
      restore();
      list.removeEventListener('keydown', onKeyDown);
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
