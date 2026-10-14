/**
 * Shadows the journeys draw that the shared elevation set lacks, as `boxShadow` text per scheme,
 * built from the set's own layers (the shared set also feeds the native surfaces, see
 * `./kit-type`).
 *
 * - `guideStrip`: a guide's note, a white strip lighter than a floating card (`inset 0 1 0 #fff,
 *   0 0 0 .5 .06, 0 10 24 −14 .25`); in dark mode the floating card's own.
 * - `inkLoading`: the ink pill while it works, its top light and drop without the resting pill's
 *   ring, the drop a little closer (`0 14 28 −10`).
 */
import { boxShadow, premium } from '@cp/design-tokens';
import type { PremiumScheme, PremiumShadow, PremiumShadowLayer } from '@cp/design-tokens';

export type KitShadowName = 'guideStrip' | 'inkLoading';

function layer(shadow: PremiumShadow, index: number): PremiumShadowLayer {
  const found = shadow[index];
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer error, never shown.
  if (found === undefined) throw new Error('premium elevation lost a layer');
  return found;
}

function build(scheme: PremiumScheme): Record<KitShadowName, PremiumShadow> {
  const { elevation, color } = premium.modes[scheme];
  const ink = elevation.ink;
  const inkLoading: PremiumShadow = [
    layer(ink, 0),
    layer(ink, 2),
    { ...layer(ink, 3), y: 14, blur: 28 },
  ];
  if (scheme === 'dark') return { guideStrip: elevation.float, inkLoading };
  return {
    guideStrip: [
      { x: 0, y: 1, blur: 0, spread: 0, color: color.card, inset: true },
      layer(elevation.float, 0),
      { x: 0, y: 10, blur: 24, spread: -14, color: layer(ink, 2).color },
    ],
    inkLoading,
  };
}

export function kitShadows(scheme: PremiumScheme): Readonly<Record<KitShadowName, string>> {
  const set = build(scheme);
  return { guideStrip: boxShadow(set.guideStrip), inkLoading: boxShadow(set.inkLoading) };
}
