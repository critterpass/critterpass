// `@shopify/react-native-skia` is JSI-based native rendering with no Jest-runnable equivalent (the
// same class of native/hardware boundary Reanimated's own official mock exists for) — these stand
// in as plain views so the component tree around them still mounts and un-mounts normally.
jest.mock('@shopify/react-native-skia', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- a `jest.mock` factory cannot reference this file's own top-level imports (Jest's hoisting forbids it); `require`'s untyped return is the only way to reach `react`/`react-native` from inside it. */
  const React = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
  const passthrough = (props: Record<string, unknown>) =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- see above.
    React.createElement(View, props, props.children);
  return { Canvas: passthrough, Group: passthrough, Circle: passthrough };
});
jest.mock('../feedback', () => ({ impact: jest.fn() }));
jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));

import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ComponentRef, RefObject } from 'react';
import { Text, type View } from 'react-native';

import { impact } from '../feedback';
import { useMotionMode } from '../motion-mode';
import { OverlayHost } from '../overlay/OverlayHost';
import { flyTo, flyToOverlay } from '../overlay/fly-to';
import {
  confettiOverlay,
  confettiParticleCount,
  triggerConfetti,
  useConfetti,
} from '../patterns/confetti';
import { drawGate, useDraw, useDrawGate } from '../patterns/draw';
import { usePageTurn } from '../patterns/page-turn';
import { useRays } from '../patterns/rays';
import { resetMotionModeForTests } from '../test-support/reset-motion-mode';

const mockedImpact = impact as jest.MockedFunction<typeof impact>;

async function forceReducedMotion(): Promise<void> {
  const { result, rerender } = await renderHook(() => useMotionMode());
  await act(() => {
    result.current[1]('reduced');
  });
  await rerender(undefined);
}

beforeEach(async () => {
  mockedImpact.mockClear();
  await resetMotionModeForTests();
});

describe('confettiParticleCount', () => {
  it('caps every intensity at 40 on low-tier devices', () => {
    expect(confettiParticleCount('small', 'low')).toBe(40);
    expect(confettiParticleCount('medium', 'low')).toBe(40);
    expect(confettiParticleCount('large', 'low')).toBe(40);
    expect(confettiParticleCount('huge', 'low')).toBe(40);
  });

  it('uses the full requested count on mid/high tier devices', () => {
    expect(confettiParticleCount('medium', 'mid')).toBe(70);
    expect(confettiParticleCount('huge', 'high')).toBe(140);
  });
});

describe('useConfetti', () => {
  it('spawns the tier-capped particle count when active', async () => {
    const { result } = await renderHook(() =>
      useConfetti({ active: true, intensity: 'huge', tier: 'low', originX: 0, originY: 0 }),
    );
    expect(result.current).toHaveLength(40);
  });

  it('spawns nothing under reduced motion (omitted, not just frozen)', async () => {
    await forceReducedMotion();
    const { result } = await renderHook(() =>
      useConfetti({ active: true, intensity: 'medium', tier: 'high', originX: 0, originY: 0 }),
    );
    expect(result.current).toHaveLength(0);
  });
});

describe('drawGate / useDrawGate', () => {
  it('grants only 2 concurrent slots, queueing a 3rd until one releases', async () => {
    const first = await renderHook(() => useDrawGate(true));
    const second = await renderHook(() => useDrawGate(true));
    const third = await renderHook(() => useDrawGate(true));

    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);
    expect(third.result.current).toBe(false);
    expect(drawGate.activeCount).toBe(2);
    expect(drawGate.queueLength).toBe(1);

    await first.unmount();
    await third.rerender(undefined);
    expect(third.result.current).toBe(true);
    expect(drawGate.queueLength).toBe(0);

    await second.unmount();
    await third.unmount();
  });
});

describe('useDraw', () => {
  it('only starts drawing once its gate slot is granted', async () => {
    const blocker1 = await renderHook(() => useDrawGate(true));
    const blocker2 = await renderHook(() => useDrawGate(true));
    const { result } = await renderHook(() => useDraw({ active: true, kind: 'icon' }));
    expect(result.current.isDrawing).toBe(false);
    expect(result.current.progress.value).toBe(0);

    await blocker1.unmount();
    await blocker2.unmount();
  });
});

describe('other T5 overlay patterns produce a result without throwing', () => {
  it('useRays is omitted (not just frozen) under reduced motion', async () => {
    await forceReducedMotion();
    const { result } = await renderHook(() => useRays(true));
    expect(result.current.visible).toBe(false);
  });

  it('usePageTurn fires the page cue once settled', async () => {
    const onSettled = jest.fn();
    await renderHook(() => usePageTurn({ active: true, onSettled }));
    expect(mockedImpact).toHaveBeenCalledWith('page');
  });
});

describe('flyTo + OverlayHost', () => {
  // A hand-built ref (rather than one attached via RNTL rendering) sidesteps any question of
  // whether `getByTestId`'s returned instance is the exact same object `ref` would receive —
  // `flyTo` only ever calls `.current.measureInWindow`, so this is a faithful, simpler double.
  function refMeasuring(x: number, y: number, width: number, height: number) {
    return {
      current: {
        measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
          cb(x, y, width, height),
      },
    } as unknown as RefObject<ComponentRef<typeof View>>;
  }

  it('measures both refs, queues a request, and animates it to completion (thud.soft, then dismissed)', async () => {
    const sourceRef = refMeasuring(0, 0, 40, 40);
    const targetRef = refMeasuring(200, 400, 40, 40);

    await render(<OverlayHost />);
    await act(async () => {
      await flyTo(sourceRef, targetRef, <Text>sticker</Text>);
    });

    await waitFor(() => {
      expect(mockedImpact).toHaveBeenCalledWith('thud.soft');
    });
    expect(flyToOverlay.requests).toHaveLength(0);
  });
});

describe('confetti in OverlayHost', () => {
  it('draws its canvas only while a burst plays', async () => {
    await render(<OverlayHost />);
    expect(screen.queryByTestId('overlay-confetti-canvas')).toBeNull();

    await act(() => {
      triggerConfetti(100, 200, 'small', 'high');
    });
    expect(screen.getByTestId('overlay-confetti-canvas')).toBeTruthy();

    const [burst] = confettiOverlay.requests;
    await act(() => {
      confettiOverlay.dismiss(burst?.id ?? -1);
    });
    expect(screen.queryByTestId('overlay-confetti-canvas')).toBeNull();
  });
});
