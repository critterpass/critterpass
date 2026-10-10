/**
 * Premium shadows (foundations-spec.md §4 "Elevation"), stored as layers so React Native's
 * `boxShadow`, SwiftUI and Compose can each draw them. Light values are the spec table; dark values
 * are 1.E's: a 0.5 white hairline ring and deeper black drops instead of soft grey ones.
 */

export interface PremiumShadowLayer {
  readonly x: number;
  readonly y: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: string;
  readonly inset?: boolean;
}

export type PremiumShadow = readonly PremiumShadowLayer[];

export interface PremiumElevation {
  readonly card: PremiumShadow;
  readonly raised: PremiumShadow;
  readonly float: PremiumShadow;
  readonly toast: PremiumShadow;
  readonly toastInk: PremiumShadow;
  readonly sticker: PremiumShadow;
  readonly ink: PremiumShadow;
  readonly segmentThumb: PremiumShadow;
  readonly toggleKnob: PremiumShadow;
  readonly emptyDisc: PremiumShadow;
  readonly photo: PremiumShadow;
  readonly tabActive: PremiumShadow;
}

const layer = (
  x: number,
  y: number,
  blur: number,
  spread: number,
  color: string,
  inset = false,
): PremiumShadowLayer =>
  inset ? { x, y, blur, spread, color, inset } : { x, y, blur, spread, color };

/** A hairline ring drawn as a zero-blur shadow (`0 0 0 .5px`). */
const ring = (color: string, inset = false) => layer(0, 0, 0, 0.5, color, inset);

export const premiumElevationLight: PremiumElevation = {
  card: [
    ring('rgba(20,22,40,.05)'),
    layer(0, 1, 2, 0, 'rgba(20,22,40,.04)'),
    layer(0, 14, 34, -12, 'rgba(20,22,40,.16)'),
  ],
  raised: [layer(0, 1, 2, 0, 'rgba(20,22,40,.06)'), layer(0, 4, 14, 0, 'rgba(20,22,40,.1)')],
  float: [
    ring('rgba(20,22,40,.06)'),
    layer(0, 1, 2, 0, 'rgba(20,22,40,.04)'),
    layer(0, 8, 20, -6, 'rgba(20,22,40,.14)'),
  ],
  toast: [layer(0, 2, 4, 0, 'rgba(20,22,40,.06)'), layer(0, 14, 30, 0, 'rgba(20,22,40,.14)')],
  toastInk: [layer(0, 14, 30, 0, 'rgba(28,29,36,.3)')],
  sticker: [layer(0, 4, 10, 0, 'rgba(20,22,40,.18)')],
  ink: [
    layer(0, 1, 0, 0, 'rgba(255,255,255,.18)', true),
    ring('rgba(255,255,255,.07)', true),
    layer(0, 1, 2, 0, 'rgba(20,22,40,.25)'),
    layer(0, 16, 32, -10, 'rgba(20,22,40,.5)'),
  ],
  segmentThumb: [ring('rgba(20,22,40,.04)'), layer(0, 3, 8, 0, 'rgba(20,22,40,.12)')],
  toggleKnob: [layer(0, 2, 6, 0, 'rgba(0,0,0,.18)'), ring('rgba(0,0,0,.04)')],
  emptyDisc: [layer(0, 2, 4, 0, 'rgba(20,22,40,.05)'), layer(0, 20, 44, 0, 'rgba(20,22,40,.1)')],
  photo: [layer(0, 2, 4, 0, 'rgba(20,22,40,.08)'), layer(0, 12, 24, 0, 'rgba(20,22,40,.14)')],
  tabActive: [
    layer(0, 1, 0, 0, 'rgba(255,255,255,.18)', true),
    layer(0, 6, 14, -4, 'rgba(20,22,40,.4)'),
  ],
};

const darkRing = ring('rgba(255,255,255,.09)');

export const premiumElevationDark: PremiumElevation = {
  card: [darkRing, layer(0, 1, 2, 0, 'rgba(0,0,0,.09)'), layer(0, 14, 34, -12, 'rgba(0,0,0,.35)')],
  raised: [darkRing, layer(0, 4, 10, -6, 'rgba(0,0,0,.44)')],
  float: [darkRing, layer(0, 14, 30, -12, 'rgba(0,0,0,.66)')],
  toast: [darkRing, layer(0, 14, 30, -12, 'rgba(0,0,0,.66)')],
  toastInk: [darkRing, layer(0, 14, 30, -12, 'rgba(0,0,0,.66)')],
  sticker: [layer(0, 4, 10, 0, 'rgba(0,0,0,.55)')],
  ink: [
    layer(0, 1, 0, 0, 'rgba(255,255,255,.07)', true),
    ring('rgba(255,255,255,.05)', true),
    layer(0, 1, 2, 0, 'rgba(0,0,0,.55)'),
    layer(0, 16, 32, -10, 'rgba(0,0,0,.7)'),
  ],
  segmentThumb: [darkRing, layer(0, 3, 8, 0, 'rgba(0,0,0,.35)')],
  toggleKnob: [layer(0, 2, 6, 0, 'rgba(0,0,0,.18)')],
  emptyDisc: [darkRing, layer(0, 20, 44, 0, 'rgba(0,0,0,.35)')],
  photo: [layer(0, 2, 4, 0, 'rgba(0,0,0,.2)'), layer(0, 12, 24, 0, 'rgba(0,0,0,.44)')],
  tabActive: [
    layer(0, 1, 0, 0, 'rgba(255,255,255,.07)', true),
    layer(0, 6, 14, -4, 'rgba(0,0,0,.5)'),
  ],
};

/** CSS `box-shadow` text for a shadow: React Native's `boxShadow` style and the web read it as-is. */
export function boxShadow(shadow: PremiumShadow): string {
  return shadow
    .map(
      (l) =>
        `${l.inset === true ? 'inset ' : ''}${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${l.color}`,
    )
    .join(', ');
}
