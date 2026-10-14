import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { DISMISSAL_GRACE_MS, liftedTop, useMenuChoice } from '../menu-choice';
import { stopOffers } from '../stop-offers';

describe('a glass menu letting go of a choice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs the chosen row only once the menu has gone, after closing it', async () => {
    const calls: string[] = [];
    const { result } = await renderHook(() => useMenuChoice(() => calls.push('close'), true));
    await act(() => result.current.choose(() => calls.push('share')));
    expect(result.current.open).toBe(false);
    expect(calls).toEqual([]);
    await act(() => result.current.dismissed());
    expect(calls).toEqual(['close', 'share']);
  });

  it('closes with nothing run on a tap outside', async () => {
    const calls: string[] = [];
    const { result } = await renderHook(() => useMenuChoice(() => calls.push('close'), true));
    await act(() => result.current.dismiss());
    await act(() => result.current.dismissed());
    expect(calls).toEqual(['close']);
  });

  it('takes the first choice only, and lands it even when the dismissal never says so', async () => {
    const calls: string[] = [];
    const { result } = await renderHook(() => useMenuChoice(() => calls.push('close'), true));
    await act(() => result.current.choose(() => calls.push('remove')));
    await act(() => result.current.choose(() => calls.push('share')));
    await act(() => jest.advanceTimersByTime(DISMISSAL_GRACE_MS));
    await act(() => result.current.dismissed());
    expect(calls).toEqual(['close', 'remove']);
  });

  it('runs straight away where the system does not wait on the menu', async () => {
    const calls: string[] = [];
    const { result } = await renderHook(() => useMenuChoice(() => calls.push('close'), false));
    await act(() => result.current.choose(() => calls.push('details')));
    expect(calls).toEqual(['close', 'details']);
  });
});

describe('where a lifted stop and its menu sit', () => {
  const room = { screenHeight: 800, top: 60, bottom: 40, fallback: 170 };

  it('lifts the card where the stop sat when the menu fits under it', () => {
    const from = { x: 80, y: 300, width: 280, height: 56 };
    expect(liftedTop({ ...room, from, groupHeight: 380 })).toBe(300);
  });

  it('raises card and menu together when the stop sits too low for the menu', () => {
    const from = { x: 80, y: 640, width: 280, height: 56 };
    expect(liftedTop({ ...room, from, groupHeight: 380 })).toBe(800 - 40 - 380);
  });

  it('never goes above the top inset, and uses the design’s place for a stop picked on the map', () => {
    expect(liftedTop({ ...room, from: null, groupHeight: 380 })).toBe(170);
    const from = { x: 80, y: 700, width: 280, height: 56 };
    expect(liftedTop({ ...room, from, groupHeight: 760 })).toBe(60);
  });
});

describe('what a stop’s menu offers', () => {
  it('offers every row on an editable stop that is not booked', () => {
    expect(stopOffers({ readOnly: false, booked: false, canAsk: true })).toEqual({
      move: true,
      time: true,
      ask: true,
      remove: true,
    });
  });

  it('never offers removing a booked stop', () => {
    expect(stopOffers({ readOnly: false, booked: true, canAsk: true }).remove).toBe(false);
  });

  it('offers only reading, sharing and asking on a plan that can’t be edited', () => {
    expect(stopOffers({ readOnly: true, booked: false, canAsk: true })).toEqual({
      move: false,
      time: false,
      ask: true,
      remove: false,
    });
    expect(stopOffers({ readOnly: true, booked: false, canAsk: false }).ask).toBe(false);
  });
});
