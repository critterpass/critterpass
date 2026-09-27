import { z } from 'zod';

import type { CritterSpec } from '../data/types';
import type { EdgeStyle, Pose } from '../core/model';

// Zod schemas for the two jsonb columns critter-art's render spec is built from
// (docs/data-model.md §3.9): `critters.art_params` (this file's `artParamsSchema`, typed `ArtParams`
// — the same shape as `CritterSpec`) and `critter_forms.palette`/`pose`/`edge` (`paletteSchema`,
// `poseSchema`, `edgeStyleSchema`, combined as `formSpecSchema`). The content factory
// validates generated critters/forms against these before they ship.
//
// No `satisfies z.ZodType<...>` cross-check here: zod 4 infers optional object fields as
// `{ field: T | undefined }` (value-level union), while this package's `exactOptionalPropertyTypes`
// types declare them as `{ field?: T }` (key-level optional) — the two are intentionally different
// and TypeScript correctly rejects a `satisfies` between them. schema.test.ts instead parses every
// real critter/form value the package ships (all 150 `art_params`, the `designed.ts` fixtures)
// through these schemas, which is the guarantee that actually matters.

/** `critters.art_params` is the same shape as `data/types.ts`'s `CritterSpec`, named `ArtParams` to match the data-model column. */
export type ArtParams = CritterSpec;

export const archetypeNameSchema = z.enum([
  'sit',
  'stand',
  'bird',
  'wader',
  'fish',
  'lizard',
  'frog',
  'turtle',
  'snake',
  'bug',
  'octo',
  'crab',
  'seal',
  'whale',
  'nessie',
]);

export const colorTripletSchema = z.tuple([z.string(), z.string(), z.string()]);

export const artParamsSchema = z.object({
  b: archetypeNameSchema,
  c: colorTripletSchema,
  v: z.string().optional(),
  ears: z.string().optional(),
  tail: z.string().optional(),
  muz: z.string().optional(),
  acc: z.string().optional(),
  pat: z.string().optional(),
  beak: z.string().optional(),
  bc: z.string().optional(),
  lc: z.string().optional(),
  mask: z.string().optional(),
  horns: z.string().optional(),
  ec: z.string().optional(),
  ic: z.string().optional(),
  fcol: z.string().optional(),
  hy: z.number().optional(),
  hw: z.number().optional(),
  hh: z.number().optional(),
  bw: z.number().optional(),
  er: z.number().optional(),
  eg: z.number().optional(),
  mane: z.union([z.literal(1), z.literal('ruff')]).optional(),
  tusks: z.literal(1).optional(),
  beard: z.literal(1).optional(),
  ring: z.literal(1).optional(),
  hair: z.literal(1).optional(),
  crest: z.literal(1).optional(),
  teeth: z.literal(1).optional(),
  red: z.literal(1).optional(),
  coat: z.union([z.literal('curly'), z.literal('fluffy')]).optional(),
  arms: z.union([z.literal('long'), z.literal('dark'), z.literal('claws')]).optional(),
  belly: z.literal(0).optional(),
  pose: z.literal('cheer').optional(),
  fins: z.literal('spiky').optional(),
  hc: z.string().optional(),
  hc2: z.string().optional(),
  mc: z.string().optional(),
  mzc: z.string().optional(),
  tc: z.string().optional(),
  tt: z.string().optional(),
  snc: z.string().optional(),
  sc: z.string().optional(),
  fc: z.string().optional(),
  wc: z.string().optional(),
});

/** `critter_forms.palette` jsonb: `f`/`dk`/`bl` are always authored; the rest are guide-only slots or overrides. */
export const paletteSchema = z.object({
  f: z.string(),
  dk: z.string(),
  bl: z.string(),
  accent: z.string().optional(),
  leaf: z.string().optional(),
  beak2: z.string().optional(),
  stripe: z.string().optional(),
  eye: z.string().optional(),
  pupil: z.string().optional(),
  ink: z.string().optional(),
});

/** `critter_forms.pose`: every archetype pose, including the epic-only whole-body `tilt`/`hop`. */
export const poseSchema: z.ZodType<Pose> = z.enum([
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

/** `critter_forms.edge`: die-cut tier ring, `none` for common/rare. */
export const edgeStyleSchema: z.ZodType<EdgeStyle> = z.enum(['none', 'epic', 'legendary']);

export const formSpecSchema = z.object({
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  palette: paletteSchema,
  pose: poseSchema.optional(),
  edge: edgeStyleSchema,
});
