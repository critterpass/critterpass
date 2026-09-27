import { scheduleOnRN } from 'react-native-worklets';

import { impact } from '../feedback';
import type { SoundCueId } from '../impact';
import { useMotionMode } from '../motion-mode';

/** docs/design-system.md §5 Reduce Motion: "impacts fade 150 ms, no jolt/shake, ... haptic + SFX kept". */
export const REDUCED_IMPACT_FADE_MS = 150;

/** True under the design's reduced-impact rule (motion mode is `'reduced'` or `'off'`). */
export function useReducedImpactMotion(): boolean {
  const [motionMode] = useMotionMode();
  return motionMode !== 'full';
}

/**
 * Fires the feedback bus's `impact(cueId)` (haptic + SFX) from a UI-thread worklet, together with an
 * optional same-frame visual side effect (e.g. the screen jolt) — both dispatched to the JS thread in
 * one hop so they land in the same frame (docs/design-system.md §3.4 choreography rule 3: "impact =
 * visual + jolt + haptic + SFX").
 */
export function triggerImpact(cueId: SoundCueId, andAlso?: () => void): void {
  'worklet';
  scheduleOnRN(() => {
    andAlso?.();
    impact(cueId);
  });
}

/** A list item's stagger delay from its 0-based `index` and a `motion.duration.stagger.*` token (or a pattern's own documented stagger). */
export function staggerDelayMs(index: number, staggerMs: number): number {
  return index * staggerMs;
}
