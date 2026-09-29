/**
 * zod schemas for every resolved DTCG `$type` used by this package's token source.
 * Schemas validate the *resolved* value (aliases already substituted by resolve.ts), never the
 * raw `{path}` alias string, so every schema below describes the token's final concrete shape.
 * A handful of `$type` names are custom extensions (prefixed `cp`) for data DTCG has no native
 * type for (springs, textures, sound cues, transitions); see docs/design-system.md for the source
 * tables each one encodes.
 */
import { z } from 'zod';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
const RGBA_COLOR_PATTERN = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/;

export function isColorLiteral(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value) || RGBA_COLOR_PATTERN.test(value);
}

const colorSchema = z
  .string()
  .refine(isColorLiteral, { message: 'not a hex or rgba() colour literal' });
const cubicBezierSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const cornerSetSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const fontFamilySchema = z.enum(['archivo', 'geist', 'geistMono', 'voice']);
const textTransformSchema = z.enum(['none', 'uppercase']);

const dynamicTypeSchema = z.object({
  scaleFactor: z.number().positive(),
  minScale: z.number().positive().optional(),
  maxLines: z.number().int().positive().optional(),
  singleLine: z.boolean().optional(),
  autoFit: z.boolean().optional(),
});

const plainTextFallbackSchema = z.object({
  fontFamily: fontFamilySchema,
  fontWeight: z.number().int().min(100).max(900),
  fontStyle: z.enum(['normal', 'italic']),
});

const typographySchema = z.object({
  fontFamily: fontFamilySchema,
  fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().positive().optional(),
  fontSizeMin: z.number().positive().optional(),
  fontSizeMax: z.number().positive().optional(),
  lineHeight: z.number().positive(),
  letterSpacing: z.number().optional(),
  widthStep: z.number().optional(),
  widthStepMin: z.number().optional(),
  widthStepMax: z.number().optional(),
  condensed: z.boolean(),
  textTransform: textTransformSchema,
  tabularNumerals: z.boolean().optional(),
  dynamicType: dynamicTypeSchema,
  plainTextFallback: plainTextFallbackSchema.optional(),
});

const ringSchema = z.object({
  widthPt: z.number().positive(),
  color: colorSchema.nullable(),
  inset: z.boolean().optional(),
});

const doubleRingSchema = z.object({
  inner: z.object({ widthPt: z.number().positive(), color: colorSchema }),
  outer: z.object({ widthPt: z.number().positive(), color: colorSchema.nullable() }),
});

const glowSchema = z.object({
  color: colorSchema,
  blurFromPt: z.number().nonnegative(),
  blurToPt: z.number().nonnegative(),
  opacityFrom: z.number().min(0).max(1),
  opacityTo: z.number().min(0).max(1),
  durationMs: z.number().positive(),
  iterations: z.number().int().positive(),
});

const shadowSchema = z.object({
  offsetX: z.number(),
  offsetY: z.number(),
  blur: z.number().nonnegative(),
  spread: z.number(),
  color: colorSchema,
});

const tierEdgeSchema = z.object({ widthPt: z.number().positive(), color: colorSchema }).nullable();

const tierSchema = z.object({
  color: colorSchema,
  glyph: z.string().min(1),
  ring: z.boolean(),
  edge: tierEdgeSchema,
  sparkles: z.boolean().optional(),
});

const tierLockedSchema = z.object({ silhouette: colorSchema, background: colorSchema });

const alphaRangeSchema = z.object({
  hex: colorSchema,
  alphaMin: z.number().min(0).max(1),
  alphaMax: z.number().min(0).max(1),
});
const rangeSchema = z.object({ min: z.number(), max: z.number() });
const sizeGroupSchema = z.record(z.string(), z.number());
const listSchema = z.array(z.string());
const formulaSchema = z.string().min(1);

const textureValueSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
);

const soundSchema = z.object({
  kind: z.enum(['sfx', 'haptic', 'ambient', 'music', 'voice']),
  hapticIOS: z.string().nullable(),
  hapticAndroid: z.string().nullable(),
  sfxAsset: z.string().nullable(),
  category: z.string().min(1),
});

const springSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('physical'),
    stiffness: z.number().positive(),
    damping: z.number().positive(),
    mass: z.number().positive(),
    overshootPercent: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('easingDuration'),
    easing: cubicBezierSchema,
    durationMs: z.number().positive(),
    overshootPercent: z.number().nonnegative(),
  }),
]);

const transitionLegSchema = z.object({
  durationMs: z.number().positive().optional(),
  easing: cubicBezierSchema.optional(),
  spec: z.string(),
});

const transitionSchema = z.object({
  enter: transitionLegSchema.optional(),
  exit: transitionLegSchema.optional(),
  back: transitionLegSchema.optional(),
});

const surfaceSchema = z.object({ background: colorSchema.nullable(), texture: textureValueSchema });

/** Registry of every `$type` this token source declares, keyed by its exact DTCG (or `cp`-custom) name. */
export const tokenSchemas = {
  color: colorSchema,
  dimension: z.number(),
  number: z.number(),
  duration: z.number().nonnegative(),
  cubicBezier: cubicBezierSchema,
  string: z.string(),
  shadow: shadowSchema,
  typography: typographySchema,
  cpAlphaRange: alphaRangeSchema,
  cpRange: rangeSchema,
  cpSizeGroup: sizeGroupSchema,
  cpList: listSchema,
  cpFormula: formulaSchema,
  cpCornerSet: cornerSetSchema,
  cpRing: ringSchema,
  cpDoubleRing: doubleRingSchema,
  cpGlow: glowSchema,
  cpTier: tierSchema,
  cpTierLocked: tierLockedSchema,
  cpTexture: textureValueSchema,
  cpSound: soundSchema,
  cpSpring: springSchema,
  cpTransition: transitionSchema,
  cpSurface: surfaceSchema,
} as const;

export type TokenTypeName = keyof typeof tokenSchemas;

export function isKnownTokenType(type: string): type is TokenTypeName {
  return Object.hasOwn(tokenSchemas, type);
}

export interface DeclaredTokenLike {
  readonly path: string;
  readonly type: string;
  readonly value: unknown;
}

/** Validates every declared token's resolved value against the schema its own `$type` names. */
export function validateDeclarations(declarations: readonly DeclaredTokenLike[]): void {
  const errors: string[] = [];
  for (const decl of declarations) {
    if (!isKnownTokenType(decl.type)) {
      errors.push(`${decl.path}: unknown $type "${decl.type}"`);
      continue;
    }
    const result = tokenSchemas[decl.type].safeParse(decl.value);
    if (!result.success) {
      errors.push(`${decl.path} ($type ${decl.type}): ${result.error.message}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`design-tokens: invalid token(s):\n${errors.join('\n')}`);
  }
}
