/**
 * The planning map's fit: asked again while the points are still out of view, never after she
 * picked something, and never for a map under another screen.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import type { PlanningCamera } from '@/ui/map/planning';

import { useFitCamera, type FitCameraInput } from '../use-fit-camera';

const UBUD: readonly [number, number] = [115.2625, -8.5069];
/** Bounds far from Ubud: the points are out of view. */
const AWAY: [number, number, number, number] = [100, 10, 101, 11];
const CHECK_MS = 1200;

function fakeCamera() {
  const fitPoints = jest.fn();
  return { camera: { fitPoints } as unknown as PlanningCamera, fitPoints };
}

const input = (over: Partial<FitCameraInput> = {}): FitCameraInput => ({
  fitKey: 'day-1',
  ready: true,
  points: [UBUD],
  bounds: AWAY,
  ...over,
});

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

describe('fitting a planning map', () => {
  it('asks again while the points are out of view, up to four times', async () => {
    const { camera, fitPoints } = fakeCamera();
    await renderHook((props: FitCameraInput) => useFitCamera(camera, props), {
      initialProps: input(),
    });
    expect(fitPoints).toHaveBeenCalledTimes(1);
    await wait(CHECK_MS * 6);
    expect(fitPoints).toHaveBeenCalledTimes(4);
  });

  it('stops checking once she picks a pin: the camera is hers', async () => {
    const { camera, fitPoints } = fakeCamera();
    const hook = await renderHook((props: FitCameraInput) => useFitCamera(camera, props), {
      initialProps: input(),
    });
    await hook.rerender(input({ holdKey: 'stop:walk' }));
    await wait(CHECK_MS * 6);
    expect(fitPoints).toHaveBeenCalledTimes(1);
  });

  it('waits under another screen, and fits on return only when the view changed', async () => {
    const { camera, fitPoints } = fakeCamera();
    const hook = await renderHook((props: FitCameraInput) => useFitCamera(camera, props), {
      initialProps: input({ bounds: null, active: true }),
    });
    expect(fitPoints).toHaveBeenCalledTimes(1);
    await wait(CHECK_MS * 6);
    fitPoints.mockClear();

    // Covered, then back with nothing changed: where she left the camera stays.
    await hook.rerender(input({ active: false }));
    await hook.rerender(input({ active: true }));
    expect(fitPoints).not.toHaveBeenCalled();

    // Covered while the day's stops change (an edit from the day plan): no fit until it is back.
    await hook.rerender(input({ active: false }));
    await hook.rerender(input({ active: false, fitKey: 'day-1-edited' }));
    await wait(CHECK_MS * 2);
    expect(fitPoints).not.toHaveBeenCalled();
    await hook.rerender(input({ active: true, fitKey: 'day-1-edited' }));
    expect(fitPoints).toHaveBeenCalledTimes(1);
  });
});
