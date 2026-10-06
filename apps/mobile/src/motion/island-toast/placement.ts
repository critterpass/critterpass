import { Platform } from 'react-native';

import { tokens } from '@cp/design-tokens';

/** Dynamic Island's own safe-area top inset starts around here on supported iPhones (14 Pro+). */
const DYNAMIC_ISLAND_MIN_TOP_INSET_PT = 51;
/** The gap between the bottom of the safe-area top inset (just under the island) and the pill. */
export const ISLAND_GAP_PT = tokens.space['8'];
/**
 * Where the toast drops to below the status bar on a phone without an island: clear of the row of
 * header controls every screen draws there (back, ALL DAYS, SHARE), so it never sits on one.
 */
export const HEADER_CLEARANCE_PT = 56;
/** The pill never comes closer than this to the screen's side edges or side cutouts. */
const SIDE_GUTTER_PT = tokens.space['16'];

export function hasDynamicIsland(topInset: number): boolean {
  return Platform.OS === 'ios' && topInset >= DYNAMIC_ISLAND_MIN_TOP_INSET_PT;
}

export interface ToastInsets {
  readonly top: number;
  readonly left: number;
  readonly right: number;
}

export interface ToastPlacement {
  /** The pill's resting top edge, always below the safe-area top inset. */
  readonly top: number;
  readonly left: number;
  readonly right: number;
  /**
   * How far above its resting place the pill starts and ends: exactly the distance to the
   * safe-area edge, so it never draws under the island, the notch, a cutout or the status bar.
   */
  readonly travel: number;
  /** The pill's size when it starts: on an island phone it grows out from just below the island. */
  readonly startScale: number;
}

/**
 * Where the toast sits, from the real safe-area insets. The island, a notch and an Android
 * cutout are hardware: anything drawn behind them is simply hidden, so the pill stays below the
 * inset on every phone. On a Dynamic Island phone it hugs the island and grows out from under it;
 * elsewhere it drops in below the header controls.
 */
export function toastPlacement(insets: ToastInsets): ToastPlacement {
  const island = hasDynamicIsland(insets.top);
  const travel = island ? ISLAND_GAP_PT : HEADER_CLEARANCE_PT;
  return {
    top: insets.top + travel,
    left: insets.left + SIDE_GUTTER_PT,
    right: insets.right + SIDE_GUTTER_PT,
    travel,
    startScale: island ? 0.6 : 0.9,
  };
}
