/**
 * The premium theme object: the `premium` token group resolved for one scheme, with shadows already
 * written as React Native `boxShadow` text. Two frozen objects exist (light and dark), so style
 * sheets built from them are created once per scheme.
 */
import { boxShadow, premium } from '@cp/design-tokens';

import { kitShadows, type KitShadowName } from './kit-shadow';
import { kitType } from './kit-type';
import type {
  PremiumElevation,
  PremiumGlassKind,
  PremiumMaterials,
  PremiumPalette,
  PremiumScheme,
} from '@cp/design-tokens';

export interface PremiumTheme {
  readonly scheme: PremiumScheme;
  readonly color: PremiumPalette;
  readonly accent: typeof premium.accent;
  readonly stamp: typeof premium.stamp;
  readonly signal: typeof premium.signal;
  readonly type: typeof kitType;
  readonly radius: typeof premium.radius;
  readonly space: typeof premium.space;
  readonly size: typeof premium.size;
  readonly opacity: typeof premium.opacity;
  readonly tilt: typeof premium.tilt;
  readonly spring: typeof premium.spring;
  readonly motion: typeof premium.motion;
  /** Each elevation as `boxShadow` text. */
  readonly shadow: Readonly<Record<keyof PremiumElevation | KitShadowName, string>>;
  readonly material: PremiumMaterials;
  /** Each material's highlight, ring and drop stack as `boxShadow` text. */
  readonly materialShadow: Readonly<Record<PremiumGlassKind, string>>;
}

function mapValues<K extends string, V, R>(
  record: Readonly<Record<K, V>>,
  fn: (value: V) => R,
): Record<K, R> {
  const out = {} as Record<K, R>;
  for (const key of Object.keys(record) as K[]) out[key] = fn(record[key]);
  return out;
}

/**
 * App-side corrections to the dark palette: the skeleton greys sat a shade off the dark card, so a
 * waiting card read as an empty slab. Each takes the next step up among the palette's own greys,
 * which keeps the light look's step between a card and the shapes waiting on it.
 */
function darkSkeleton(color: PremiumPalette): Partial<PremiumPalette> {
  return {
    skeletonFrom: color.progressTodo,
    skeletonTo: color.stepLine,
    skeletonBar: color.progressTodo,
    skeletonBarSoft: color.skeletonFrom,
  };
}

function build(scheme: PremiumScheme): PremiumTheme {
  const mode = premium.modes[scheme];
  return Object.freeze({
    scheme,
    color: scheme === 'dark' ? { ...mode.color, ...darkSkeleton(mode.color) } : mode.color,
    accent: premium.accent,
    stamp: premium.stamp,
    signal: premium.signal,
    type: kitType,
    radius: premium.radius,
    space: premium.space,
    size: premium.size,
    opacity: premium.opacity,
    tilt: premium.tilt,
    spring: premium.spring,
    motion: premium.motion,
    shadow: { ...mapValues(mode.elevation, boxShadow), ...kitShadows(scheme) },
    material: mode.material,
    materialShadow: mapValues(mode.material, (m) => boxShadow(m.shadow)),
  });
}

export const PREMIUM_THEMES: Readonly<Record<PremiumScheme, PremiumTheme>> = {
  light: build('light'),
  dark: build('dark'),
};

/** A solid ring drawn as a zero-blur shadow (`0 0 0 <width>px <color>`), inside or outside the box. */
export function ring(width: number, color: string, inset = false): string {
  return boxShadow([{ x: 0, y: 0, blur: 0, spread: width, color, ...(inset ? { inset } : {}) }]);
}
