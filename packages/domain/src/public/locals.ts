/**
 * A place's locals as the web shows them to anyone (docs/api-contracts.md §5.6
 * `GET /v1/public/locals/{slug}`): the place, one credited photo, and how many critters there are
 * to find, each as a rarity tier and a body shape for an unnamed silhouette. A critter's name,
 * art, description, where it turns up and who found it stay in the app.
 */
import { z } from 'zod';

export const PUBLIC_LOCAL_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type PublicLocalRarity = (typeof PUBLIC_LOCAL_RARITIES)[number];

/** The body shapes a silhouette is drawn from; each is shared by many critters. */
export const PUBLIC_LOCAL_SILHOUETTES = [
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
] as const;
export type PublicLocalSilhouette = (typeof PUBLIC_LOCAL_SILHOUETTES)[number];

/** The most critters one place lists on the web. */
export const PUBLIC_LOCALS_MAX = 60;

export const publicLocalSchema = z.strictObject({
  /** The rarest tier the critter comes in. */
  rarity: z.enum(PUBLIC_LOCAL_RARITIES),
  silhouette: z.enum(PUBLIC_LOCAL_SILHOUETTES),
});
export type PublicLocal = z.infer<typeof publicLocalSchema>;

export const publicLocalsPhotoSchema = z.strictObject({
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The credit line the photo's licence asks for, shown with the photo. */
  credit: z.string().min(1),
  /** The photo's page at its source. */
  source_url: z.url(),
});
export type PublicLocalsPhoto = z.infer<typeof publicLocalsPhotoSchema>;

export const publicLocalsSchema = z.strictObject({
  kind: z.literal('locals'),
  slug: z.string(),
  name: z.string(),
  /** The country or area the place belongs to. */
  area: z.string(),
  photo: publicLocalsPhotoSchema.nullable(),
  /** How many critters there are to find here; `critters` lists every one. */
  count: z.number().int().positive(),
  critters: z.array(publicLocalSchema).min(1).max(PUBLIC_LOCALS_MAX),
});
export type PublicLocals = z.infer<typeof publicLocalsSchema>;
