/**
 * Resolves a `type.*.tokens.json` typography value against the OS Dynamic Type / font-scale
 * setting (design-system.md §5): body/row/caption variants track the OS scale up to AX3 (200%);
 * display and h1 variants are dampened to a 0.5x factor with a 0.7x floor. This only applies the
 * *accessibility* scale axis — per-script family/line-height swaps (§6) are `fontFor` in
 * apps/mobile/src/lib/fonts, layered on top of this result.
 */
import type { z } from 'zod';

import type { tokenSchemas } from './schema.js';

export type TypographyValue = z.infer<(typeof tokenSchemas)['typography']>;

export interface ResolveTypeVariantOptions {
  /** OS Dynamic Type / font-scale multiplier; 1 = 100%, 2 = the AX3 / Android 200% ceiling. */
  readonly fontScale?: number;
}

export interface ResolvedTypeVariant {
  readonly fontFamily: TypographyValue['fontFamily'];
  readonly fontWeight: number;
  readonly fontSize: number;
  /** Line height in points, ready for a React Native `lineHeight` style. */
  readonly lineHeight: number;
  readonly lineHeightMultiplier: number;
  /** Letter spacing in points, ready for a React Native `letterSpacing` style (0 when undeclared). */
  readonly letterSpacing: number;
  readonly textTransform: TypographyValue['textTransform'];
  readonly condensed: boolean;
  readonly tabularNumerals: boolean;
  readonly maxLines: number | undefined;
}

const ACCESSIBILITY_SCALE_CEILING = 2;

/**
 * Nominal (un-scaled) font size for a variant: the declared `fontSize` when the design gives one,
 * else the top of its auto-fit range (`fontSizeMax`) — auto-fit variants are sized as large as
 * they can be and only shrink under layout pressure, which is the `ui/` component's job, not this
 * leaf package's.
 */
function nominalFontSize(token: TypographyValue): number {
  if (token.fontSize !== undefined) return token.fontSize;
  if (token.fontSizeMax !== undefined) return token.fontSizeMax;
  throw new Error('design-tokens: typography token has neither fontSize nor fontSizeMax');
}

export function resolveTypeVariant(
  token: TypographyValue,
  options: ResolveTypeVariantOptions = {},
): ResolvedTypeVariant {
  const fontScale = options.fontScale ?? 1;
  if (!Number.isFinite(fontScale) || fontScale <= 0) {
    throw new Error(`design-tokens: fontScale must be a positive number, got ${fontScale}`);
  }

  const { scaleFactor, minScale } = token.dynamicType;
  const dampenedScale = 1 + (fontScale - 1) * scaleFactor;
  const effectiveScale = Math.min(ACCESSIBILITY_SCALE_CEILING, Math.max(minScale ?? 0, dampenedScale));

  const fontSize = nominalFontSize(token) * effectiveScale;
  const letterSpacing = (token.letterSpacing ?? 0) * fontSize;

  return {
    fontFamily: token.fontFamily,
    fontWeight: token.fontWeight,
    fontSize,
    lineHeight: fontSize * token.lineHeight,
    lineHeightMultiplier: token.lineHeight,
    letterSpacing,
    textTransform: token.textTransform,
    condensed: token.condensed,
    tabularNumerals: token.tabularNumerals ?? false,
    maxLines: token.dynamicType.maxLines,
  };
}
