import { readFileSync } from 'node:fs';

import { z } from 'zod';

// Matches the phase architecture note's manifest shape: `{targets:[{kind|all, forms, poses,
// variants: color|mask|mono|stamp|blur, sizesPt, scales, crop: none|face|circle, bg?, format:
// png|webp|svg|vector-drawable, out}]}`.
export const rarityFormSchema = z.enum(['common', 'rare', 'epic', 'legendary']);
export const variantSchema = z.enum(['color', 'mask', 'mono', 'stamp', 'blur']);
export const cropSchema = z.enum(['none', 'face', 'circle']);
export const formatSchema = z.enum(['png', 'webp', 'svg', 'vector-drawable']);
export const poseSchema = z.enum([
  'idle',
  'wave',
  'cheer',
  'think',
  'point',
  'sleep',
  'crack',
  'tilt',
  'hop',
]);

export const bakeTargetSchema = z.object({
  /** A kind/critter id, a list of them, or `'all'` for every registered CritterDex critter. */
  kind: z.union([z.literal('all'), z.string(), z.array(z.string()).min(1)]),
  /** Rarity tiers to bake. `'common'` is always the kind's own default palette (no form override). */
  forms: z.array(rarityFormSchema).default(['common']),
  poses: z.array(poseSchema).default(['idle']),
  variants: z.array(variantSchema).min(1),
  sizesPt: z.array(z.number().positive()).min(1),
  scales: z.array(z.number().positive()).min(1),
  crop: cropSchema.default('none'),
  bg: z.string().optional(),
  format: formatSchema.default('png'),
  /** Output directory, relative to the workspace root, this target's files are written under. */
  out: z.string().min(1),
});

export const bakeManifestSchema = z.object({
  targets: z.array(bakeTargetSchema).min(1),
});

export type RarityForm = z.infer<typeof rarityFormSchema>;
export type BakeVariant = z.infer<typeof variantSchema>;
export type BakeCrop = z.infer<typeof cropSchema>;
export type BakeFormat = z.infer<typeof formatSchema>;
export type BakePose = z.infer<typeof poseSchema>;
export type BakeTarget = z.infer<typeof bakeTargetSchema>;
export type BakeManifest = z.infer<typeof bakeManifestSchema>;

/** Reads and validates a manifest JSON file, throwing a readable error on invalid shape. */
export function loadManifest(path: string): BakeManifest {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = bakeManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`invalid bake manifest at ${path}:\n${result.error.message}`);
  }
  return result.data;
}

// The 10 app icons (`templates/app-icons.ts`) are a fixed, hand-authored list, not a cross-product
// like `bakeTargetSchema` above — this manifest only holds genuine configuration (output roots,
// export sizes, the label font), not identity data a zod cross-product schema would need to model.
export const appIconManifestSchema = z.object({
  outIos: z.string().min(1),
  outAndroid: z.string().min(1),
  flatSizePx: z.number().positive(),
  androidForegroundPx: z.number().positive(),
  fontFamily: z.string().min(1),
  /** Path to a `.ttf`, relative to this manifest file's own directory. */
  fontFile: z.string().min(1),
});

export type AppIconManifest = z.infer<typeof appIconManifestSchema>;

export function loadAppIconManifest(path: string): AppIconManifest {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = appIconManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`invalid app icon manifest at ${path}:\n${result.error.message}`);
  }
  return result.data;
}
