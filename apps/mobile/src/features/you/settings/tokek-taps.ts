/** Settings' easter egg: five taps on Tokek, each within this long of the one before. */
export const TOKEK_TAPS = 5;
export const TOKEK_TAP_GAP_MS = 1200;

/**
 * The taps that still count after one at `now`: a slow tap starts over, and the fifth one fires
 * (and starts over too).
 */
export function tapTokek(
  taps: readonly number[],
  now: number,
): { readonly taps: number[]; readonly fire: boolean } {
  const last = taps[taps.length - 1];
  const kept = last !== undefined && now - last <= TOKEK_TAP_GAP_MS ? [...taps, now] : [now];
  return kept.length >= TOKEK_TAPS ? { taps: [], fire: true } : { taps: kept, fire: false };
}
