import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  keyboardIndex,
  notifyCenterChange,
  relativeOffset,
  settledChange,
  transitionDurationMs,
  wrapIndex,
} from '../../src/islands/coverflow/navigation';

describe('coverflow navigation', () => {
  it('wraps at both ends, including repeated laps and empty or single-item lists', () => {
    expect(wrapIndex(-1, 12)).toBe(11);
    expect(wrapIndex(12, 12)).toBe(0);
    expect(wrapIndex(-25, 12)).toBe(11);
    expect(wrapIndex(25, 12)).toBe(1);
    expect(wrapIndex(5, 0)).toBe(0);
    expect(wrapIndex(-1, 1)).toBe(0);
  });

  it('keeps neighbors adjacent across the wrap boundary and resolves the far-side tie consistently', () => {
    expect(relativeOffset(11, 0, 12)).toBe(-1);
    expect(relativeOffset(0, 11, 12)).toBe(1);
    expect(relativeOffset(6, 0, 12)).toBe(6);
    expect(relativeOffset(4, 0, 5)).toBe(-1);
    expect(relativeOffset(0, 0, 0)).toBe(0);
  });

  it('maps only navigation keys and preserves native behavior for other keys', () => {
    expect(keyboardIndex('ArrowLeft', 0, 12)).toBe(11);
    expect(keyboardIndex('ArrowRight', 11, 12)).toBe(0);
    expect(keyboardIndex('Home', 3, 12)).toBe(0);
    expect(keyboardIndex('End', 3, 12)).toBe(11);
    expect(keyboardIndex('End', 0, 0)).toBe(0);
    expect(keyboardIndex('Tab', 3, 12)).toBeNull();
    expect(keyboardIndex('Enter', 3, 12)).toBeNull();
  });

  it.each([
    ['0.75s, 0.75s', 750],
    ['750ms', 750],
    ['0s', 0],
    ['150ms, 0.75s, 400ms', 750],
    ['0.2s, 900ms, 0s', 900],
  ])('waits for the longest transition in %s', (value, expected) => {
    expect(transitionDurationMs(value)).toBe(expected);
  });
});

describe('coverflow settled changes', () => {
  const first = { id: 'first', decade: '1960s', era: '1970s' } as const;
  const second = { id: 'second', decade: '2010s', era: '2020s' } as const;

  afterEach(() => vi.useRealTimers());

  it('emits the initial selection silently before immediate navigation starts its debounce', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const changes = settledChange(callback);
    changes.initial(first);
    expect(callback).toHaveBeenCalledExactlyOnceWith(first, false);
    changes.schedule(second, 750, true);
    vi.advanceTimersByTime(869);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(callback.mock.calls).toEqual([
      [first, false],
      [second, true],
    ]);
  });

  it('waits for the transition and 120 ms, coalescing rapid changes into the final contract payload', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const changes = settledChange(callback);
    changes.schedule(first, 750, false);
    vi.advanceTimersByTime(700);
    changes.schedule(second, 750, true);
    vi.advanceTimersByTime(869);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledExactlyOnceWith(second, true);
  });

  it('suppresses unchanged selections but emits a return after a different settled selection', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const changes = settledChange(callback);
    changes.schedule(first);
    vi.advanceTimersByTime(120);
    changes.schedule(second);
    changes.schedule(first);
    vi.advanceTimersByTime(120);
    expect(callback).toHaveBeenCalledTimes(1);
    changes.schedule(second);
    vi.advanceTimersByTime(120);
    changes.schedule(first);
    vi.advanceTimersByTime(120);
    expect(callback.mock.calls.map(([detail]) => detail.id)).toEqual(['first', 'second', 'first']);
  });

  it('cancels pending callbacks when the stage is removed or the motion preference changes', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const changes = settledChange(callback);
    changes.schedule(first);
    changes.cancel();
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });

  it('keeps the final input announcement policy when changes are coalesced', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const changes = settledChange(callback);
    changes.schedule(first, 750, true);
    changes.schedule(second, 750, false);
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledExactlyOnceWith(second, false);
  });

  it('uses the latest callback without repeating equal selections or resetting the settled exhibit', () => {
    vi.useFakeTimers();
    const original = vi.fn();
    const latest = vi.fn();
    const callbackRef = { current: original };
    const dispatch = vi.fn();
    const changes = settledChange((detail) => notifyCenterChange(detail, callbackRef, dispatch));
    changes.initial(first);
    expect(original).toHaveBeenCalledExactlyOnceWith(first.id);

    changes.schedule(second, 750, true);
    callbackRef.current = latest;
    vi.runAllTimers();
    expect(latest).toHaveBeenCalledExactlyOnceWith(second.id);
    changes.schedule({ ...second }, 750, true);
    vi.runAllTimers();
    expect(dispatch.mock.calls).toEqual([[first], [second]]);
    expect(original).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
