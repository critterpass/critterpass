/**
 * `forms` release items: four per critter. Common keeps the design palette; rare is a full
 * three-slot recolour; epic adds a pose and the pink die-cut edge; legendary is a gold recolour
 * with the gold edge, bound to a legendary window or the hardest challenge a place has.
 * Palette, pose and edge are critter-art's own schemas, so anything that validates here renders.
 */
import { edgeStyleSchema, paletteSchema, poseSchema } from '@cp/critter-art';
import { z } from 'zod';

import { critterIdSchema, formKeySchema, parseFormKey, raritySchema, type Rarity } from './common';

/** XP a form is worth when befriended. */
export const FORM_XP: Readonly<Record<Rarity, number>> = {
  common: 10,
  rare: 25,
  epic: 60,
  legendary: 150,
};

export const REQUIRED_EDGE: Readonly<Record<Rarity, 'none' | 'epic' | 'legendary'>> = {
  common: 'none',
  rare: 'none',
  epic: 'epic',
  legendary: 'legendary',
};

export const formItemSchema = z
  .object({
    id: formKeySchema,
    critter_id: critterIdSchema,
    rarity: raritySchema,
    name: z.string().min(1).max(32),
    palette: paletteSchema,
    pose: poseSchema.nullable(),
    edge: edgeStyleSchema,
    note: z.string().min(1).max(140),
    /** What it takes, in the requirement voice: "At a water temple", "Summit Batur by sunrise". */
    requirement_copy: z.string().min(1).max(60),
    xp: z.number().int().positive(),
  })
  .strict()
  .superRefine((form, ctx) => {
    const key = parseFormKey(form.id);
    if (key.critterId !== form.critter_id || key.rarity !== form.rarity) {
      ctx.addIssue({ code: 'custom', message: 'id must be <critter_id>:<rarity>' });
    }
    if (form.edge !== REQUIRED_EDGE[form.rarity]) {
      ctx.addIssue({
        code: 'custom',
        message: `${form.rarity} forms carry the ${REQUIRED_EDGE[form.rarity]} edge`,
      });
    }
    if (form.rarity === 'epic' && form.pose === null) {
      ctx.addIssue({ code: 'custom', message: 'epic forms always strike a pose' });
    }
    if (form.xp !== FORM_XP[form.rarity]) {
      ctx.addIssue({
        code: 'custom',
        message: `${form.rarity} forms are worth ${FORM_XP[form.rarity]} xp`,
      });
    }
  });
export type FormItem = z.infer<typeof formItemSchema>;
