import { useLoop } from '../use-loop';
import { useReducedImpactMotion } from './shared';

export interface UseRaysResult {
  readonly style: ReturnType<typeof useLoop>;
  /** `false` under reduced/off motion — the caller layers `{ opacity: 0 }` after `style` in a style array. */
  readonly visible: boolean;
}

/**
 * A continuously spinning ray/holo backdrop, sharing the app's idle clock (`spin` loop preset).
 * Reduced motion: omitted entirely (docs/design-system.md §5, T5 step 5: "omit confetti/rays/petals"),
 * not just frozen — `useLoop`'s own static frame would still leave the rays visible, so the caller
 * layers `visible` as a second style (Reanimated's `useAnimatedStyle` result is opaque and cannot be
 * spread/merged directly in application code).
 */
export function useRays(active: boolean): UseRaysResult {
  const reduced = useReducedImpactMotion();
  const visible = active && !reduced;
  const style = useLoop('spin', { active: visible });
  return { style, visible };
}
