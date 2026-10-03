/**
 * The lab's frame meter: counts the UI thread's frames and the frames it missed while a camera
 * script runs, plus how many frames the map itself drew. A frame that took k vsyncs missed k − 1.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

/** One vsync at 60 Hz, in ms. */
const VSYNC_MS = 1000 / 60;

export interface FrameReading {
  readonly ms: number;
  readonly uiFrames: number;
  readonly uiMissed: number;
  /** Missed UI frames over the frames the run should have had. */
  readonly uiDropRatio: number;
  readonly mapFrames: number;
  readonly mapFps: number;
}

export function missedFrames(deltaMs: number): number {
  'worklet';
  return Math.max(0, Math.round(deltaMs / VSYNC_MS) - 1);
}

export function useFrameMeter() {
  const frames = useSharedValue(0);
  const missed = useSharedValue(0);
  const mapFrames = useRef(0);
  const startedAt = useRef(0);
  const callback = useFrameCallback((info) => {
    'worklet';
    const delta = info.timeSincePreviousFrame;
    if (delta === null) return;
    frames.value += 1;
    missed.value += missedFrames(delta);
  }, false);

  /* eslint-disable react-hooks/immutability -- Reanimated shared values, not React state. */
  const start = useCallback(() => {
    frames.value = 0;
    missed.value = 0;
    mapFrames.current = 0;
    startedAt.current = Date.now();
    callback.setActive(true);
  }, [callback, frames, missed]);
  /* eslint-enable react-hooks/immutability */

  const stop = useCallback((): FrameReading => {
    callback.setActive(false);
    const ms = Math.max(1, Date.now() - startedAt.current);
    const expected = ms / VSYNC_MS;
    return {
      ms,
      uiFrames: frames.value,
      uiMissed: missed.value,
      uiDropRatio: missed.value / expected,
      mapFrames: mapFrames.current,
      mapFps: (mapFrames.current * 1000) / ms,
    };
  }, [callback, frames, missed]);

  const onMapFrame = useCallback(() => {
    mapFrames.current += 1;
  }, []);

  return useMemo(() => ({ start, stop, onMapFrame }), [start, stop, onMapFrame]);
}

/**
 * The 500-place layers stay inside the budget the 40-pin map spends today: they miss at most 5
 * points more of the UI frames and draw at least 80 % of its map frames.
 */
export function withinBudget(layers: FrameReading, markers: FrameReading): boolean {
  return layers.uiDropRatio <= markers.uiDropRatio + 0.05 && layers.mapFps >= markers.mapFps * 0.8;
}
