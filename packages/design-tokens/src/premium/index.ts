/**
 * The premium token group: the native redesign's palette, type, shape, elevation, materials and
 * motion, with a light and a dark mode. Kept apart from the legacy tree (`tokens`) so the web site,
 * the admin console and the native surfaces that read the legacy values are untouched.
 */
import type { PremiumPalette } from './colors';
import { premiumAccents, premiumDark, premiumLight, premiumSignals, premiumStamps } from './colors';
import type { PremiumElevation } from './elevation';
import { premiumElevationDark, premiumElevationLight } from './elevation';
import type { PremiumMaterials } from './materials';
import { premiumMaterialsDark, premiumMaterialsLight } from './materials';
import { premiumMotion, premiumSprings } from './motion';
import { premiumRadius, premiumSize, premiumSpace } from './shape';
import { premiumType } from './type';

export type PremiumScheme = 'light' | 'dark';

export interface PremiumMode {
  readonly color: PremiumPalette;
  readonly elevation: PremiumElevation;
  readonly material: PremiumMaterials;
}

export const premium = {
  modes: {
    light: {
      color: premiumLight,
      elevation: premiumElevationLight,
      material: premiumMaterialsLight,
    },
    dark: { color: premiumDark, elevation: premiumElevationDark, material: premiumMaterialsDark },
  } satisfies Record<PremiumScheme, PremiumMode>,
  accent: premiumAccents,
  stamp: premiumStamps,
  signal: premiumSignals,
  type: premiumType,
  radius: premiumRadius,
  space: premiumSpace,
  size: premiumSize,
  spring: premiumSprings,
  motion: premiumMotion,
} as const;

export type Premium = typeof premium;

export type { PremiumPalette, PremiumStampInk, PremiumTint } from './colors';
export type { PremiumElevation, PremiumShadow, PremiumShadowLayer } from './elevation';
export { boxShadow } from './elevation';
export type { PremiumGlassKind, PremiumMaterial, PremiumMaterials } from './materials';
export type { PremiumSpring, PremiumSpringName } from './motion';
export type {
  PremiumFontFamily,
  PremiumFontWeight,
  PremiumTypeName,
  PremiumTypeStyle,
} from './type';
export { compositeOver } from './composite';
