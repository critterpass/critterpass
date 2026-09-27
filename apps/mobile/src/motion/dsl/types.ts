import type { CubicBezier } from '../easing';
import type { LoopTransform } from '../presets';

/** One `<prop><value>` or `e=<alias>` token's parsed meaning, before carry-forward is applied. */
export interface RawKeyframeAssignments {
  readonly tx?: number;
  readonly ty?: number;
  /** Uniform scale; expands to both `sx` and `sy` unless the same stop also sets one explicitly. */
  readonly s?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly r?: number;
  readonly o?: number;
  readonly easingAlias?: string;
}

export interface RawKeyframeStop {
  /** Phase within the animation, 0 to 1 inclusive, as written in the `kf` string. */
  readonly at: number;
  readonly assignments: RawKeyframeAssignments;
}

export type CompiledEasing =
  { readonly kind: 'linear' } | { readonly kind: 'bezier'; readonly bezier: CubicBezier };

export interface CompiledKeyframeStop {
  readonly at: number;
  /** Fully resolved (carry-forward applied) transform at this stop. */
  readonly transform: LoopTransform;
  /**
   * Easing for the segment leaving this stop, heading to the next one (the DSL's own convention —
   * `e=` is written on the stop a transition starts from, e.g. `0:sx0 e=lin;1:sx1`). Unused on the
   * last stop, which has no outgoing segment.
   */
  readonly easing: CompiledEasing;
}
