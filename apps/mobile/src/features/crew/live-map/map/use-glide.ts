/**
 * Pins glide between fixes instead of jumping: from where the pin is drawn now to the new fix over
 * the time between the two fixes, at most 1.5 s. Reduced motion jumps.
 */
import { useEffect, useRef, useState } from 'react';

import { useMotionMode } from '@/motion/motion-mode';

export const MAX_GLIDE_MS = 1500;

export interface GlidePoint {
  readonly lat: number;
  readonly lng: number;
  /** Epoch ms of the fix. */
  readonly at: number;
}

export function glideDuration(from: GlidePoint, to: GlidePoint): number {
  return Math.max(0, Math.min(MAX_GLIDE_MS, to.at - from.at));
}

/** Position at `progress` (0 to 1) along the glide, eased out. */
export function glideAt(from: GlidePoint, to: GlidePoint, progress: number): [number, number] {
  const p = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - p) * (1 - p);
  return [from.lng + (to.lng - from.lng) * eased, from.lat + (to.lat - from.lat) * eased];
}

/** `[lng, lat]` to draw the pin at this frame. */
export function useGlide(target: GlidePoint): [number, number] {
  const [motionMode] = useMotionMode();
  const [drawn, setDrawn] = useState<[number, number]>(() => [target.lng, target.lat]);
  const drawnRef = useRef<[number, number]>([target.lng, target.lat]);
  const lastAt = useRef(target.at);

  useEffect(() => {
    const start: GlidePoint = {
      lng: drawnRef.current[0],
      lat: drawnRef.current[1],
      at: lastAt.current,
    };
    lastAt.current = target.at;
    const duration = motionMode === 'full' ? glideDuration(start, target) : 0;
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const progress = duration === 0 ? 1 : (Date.now() - began) / duration;
      const next = glideAt(start, target, progress);
      drawnRef.current = next;
      setDrawn(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target.lat, target.lng, target.at, motionMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return drawn;
}
