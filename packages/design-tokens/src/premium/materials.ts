/**
 * Premium materials (foundations-spec.md §5). On iOS 26 the system Liquid Glass supplies blur and
 * refraction; these are the design's fallback values, used as-is where the OS has no glass
 * (Android) and as the highlight/shadow stack drawn around native glass where the design adds one.
 *
 * `fill` is what a surface paints when it cannot blur: the translucent tint composited onto the
 * mode's solid ground, so text behind never shows through. Clear glass sits over photos and maps,
 * where there is no ground: it keeps a dark tint at the dark-glass strength (72%) so white text
 * stays readable without a blur.
 */
import { premiumDark, premiumLight } from './colors';
import { compositeOver } from './composite';
import type { PremiumShadow } from './elevation';

export type PremiumGlassKind = 'clear' | 'regular' | 'nav' | 'sheet';

export interface PremiumMaterial {
  /** The design's translucent tint (drawn over a blur). */
  readonly tint: string;
  /** Blur radius and saturation of the design's backdrop filter. */
  readonly blur: number;
  readonly saturate: number;
  /** Opaque (or dark-tinted, for clear glass) fill used where the platform cannot blur. */
  readonly fill: string;
  /** Inner highlight, rings and drop shadow around the surface. */
  readonly shadow: PremiumShadow;
  /** Foreground on the material (glyphs and labels). */
  readonly foreground: string;
}

export type PremiumMaterials = Readonly<Record<PremiumGlassKind, PremiumMaterial>>;

const clear: PremiumMaterial = {
  tint: 'rgba(18,20,28,.30)',
  blur: 24,
  saturate: 1.6,
  fill: 'rgba(18,20,28,.72)',
  shadow: [
    { x: 0, y: 1, blur: 0, spread: 0, color: 'rgba(255,255,255,.24)', inset: true },
    { x: 0, y: 0, blur: 0, spread: 0.5, color: 'rgba(255,255,255,.14)', inset: true },
    { x: 0, y: 20, blur: 40, spread: -16, color: 'rgba(0,0,0,.45)' },
  ],
  foreground: '#ffffff',
};

const TOP = { x: 0, y: 1, blur: 0, spread: 0, color: 'rgba(255,255,255,.95)', inset: true };
const BOTTOM = { x: 0, y: -1, blur: 0, spread: 0, color: 'rgba(255,255,255,.4)', inset: true };
const WHITE_RING = { x: 0, y: 0, blur: 0, spread: 0.5, color: 'rgba(255,255,255,.6)', inset: true };

/** Panel glass: top and bottom highlights, white ring, ink ring, drop. */
const regularStack = (inkRing: string, drop: PremiumShadow[number]): PremiumShadow => [
  TOP,
  BOTTOM,
  WHITE_RING,
  { x: 0, y: 0, blur: 0, spread: 0.5, color: inkRing },
  drop,
];

/** Nav-button glass (header circles, glass pills): no bottom highlight. */
const navStack = (inkRing: string, drop: PremiumShadow[number]): PremiumShadow => [
  TOP,
  WHITE_RING,
  { x: 0, y: 0, blur: 0, spread: 0.5, color: inkRing },
  drop,
];

export const premiumMaterialsLight: PremiumMaterials = {
  clear,
  regular: {
    tint: 'rgba(255,255,255,.56)',
    blur: 24,
    saturate: 1.9,
    fill: compositeOver('rgba(255,255,255,.56)', premiumLight.ground),
    shadow: regularStack('rgba(28,29,36,.08)', {
      x: 0,
      y: 22,
      blur: 44,
      spread: -14,
      color: 'rgba(20,22,40,.32)',
    }),
    foreground: '#1c1d24',
  },
  nav: {
    tint: 'rgba(255,255,255,.62)',
    blur: 18,
    saturate: 1.8,
    fill: compositeOver('rgba(255,255,255,.62)', premiumLight.ground),
    shadow: navStack('rgba(20,22,40,.07)', {
      x: 0,
      y: 8,
      blur: 20,
      spread: -6,
      color: 'rgba(20,22,40,.16)',
    }),
    foreground: '#1c1d24',
  },
  sheet: {
    tint: 'rgba(248,248,250,.86)',
    blur: 34,
    saturate: 1.8,
    fill: compositeOver('rgba(248,248,250,.86)', premiumLight.ground),
    shadow: regularStack('rgba(28,29,36,.08)', {
      x: 0,
      y: 22,
      blur: 44,
      spread: -14,
      color: 'rgba(20,22,40,.32)',
    }),
    foreground: '#1c1d24',
  },
};

/** Dark glass (1.E, phones 1.10–1.13): 70% dark tint, 7% top highlight, white hairlines. */
const darkStack = (drop: PremiumShadow[number]): PremiumShadow => [
  { x: 0, y: 1, blur: 0, spread: 0, color: 'rgba(255,255,255,.07)', inset: true },
  { x: 0, y: 0, blur: 0, spread: 0.5, color: 'rgba(255,255,255,.05)', inset: true },
  { x: 0, y: 0, blur: 0, spread: 0.5, color: 'rgba(255,255,255,.09)' },
  drop,
];

export const premiumMaterialsDark: PremiumMaterials = {
  clear,
  regular: {
    tint: 'rgba(40,41,50,.70)',
    blur: 18,
    saturate: 1.8,
    fill: compositeOver('rgba(40,41,50,.70)', premiumDark.ground),
    shadow: darkStack({ x: 0, y: 8, blur: 20, spread: -6, color: 'rgba(0,0,0,.35)' }),
    foreground: '#f2f2f5',
  },
  nav: {
    tint: 'rgba(40,41,50,.70)',
    blur: 18,
    saturate: 1.8,
    fill: compositeOver('rgba(40,41,50,.70)', premiumDark.ground),
    shadow: darkStack({ x: 0, y: 8, blur: 20, spread: -6, color: 'rgba(0,0,0,.35)' }),
    foreground: '#f2f2f5',
  },
  sheet: {
    tint: 'rgba(40,41,50,.82)',
    blur: 34,
    saturate: 1.8,
    fill: compositeOver('rgba(40,41,50,.82)', premiumDark.ground),
    shadow: darkStack({ x: 0, y: 22, blur: 44, spread: -14, color: 'rgba(0,0,0,.5)' }),
    foreground: '#f2f2f5',
  },
};
