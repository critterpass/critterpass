/**
 * `spawns` release items: how each form is found. Kinds follow the product rule set: `presence`
 * (be at one place), `any_of` (any of several places; `n` of them for "three water temples",
 * copy "At a water temple"), `set_count` (befriend `n` others in the same set), `window` (a
 * legendary window at a place) and `co_presence` (`min_members` of the crew together).
 * Places are named by POI content refs (`editorial:<key>`, `fsq_os:<id>`, `overture:<id>`) or by
 * explicit geofences for places without curated POIs; the publish job resolves refs to POI ids.
 */
import { z } from 'zod';

import { formKeySchema, placeCodeSchema, slugSchema } from './common';
import { solarConditionSchema } from './legendary-windows';

export const SPAWN_KINDS = ['presence', 'any_of', 'set_count', 'window', 'co_presence'] as const;
export const spawnKindSchema = z.enum(SPAWN_KINDS);
export type SpawnKind = z.infer<typeof spawnKindSchema>;

export const DEFAULT_GEOFENCE_RADIUS_M = 50;
export const DEFAULT_DWELL_S = 300;

export const poiRefSchema = z
  .string()
  .regex(/^(editorial|fsq_os|overture):[\w.-]+$/u, 'must be <source>:<id>');

export const geofenceSchema = z
  .object({
    label: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius_m: z.number().int().min(30).max(300),
  })
  .strict();
export type Geofence = z.infer<typeof geofenceSchema>;

export const spawnRuleItemSchema = z
  .object({
    id: z.string().regex(/^cp-\d{3}:(common|rare|epic|legendary)#\d+$/u),
    form_id: formKeySchema,
    kind: spawnKindSchema,
    set_code: placeCodeSchema,
    /** `destinations.slug` when the place is a destination; null for spots outside one. */
    destination: slugSchema.nullable(),
    poi_refs: z.array(poiRefSchema),
    geofences: z.array(geofenceSchema),
    /** any_of: how many distinct places; set_count: how many set members befriended. */
    n: z.number().int().min(1).nullable(),
    dwell_s: z.number().int().min(0).max(3600),
    hold_ms: z.number().int().min(0).max(10_000).nullable(),
    /** window kind: the legendary window id. */
    window_id: slugSchema.nullable(),
    solar: solarConditionSchema.nullable(),
    min_members: z.number().int().min(2).nullable(),
    /** Home-set rules only fire in the foreground, after the explore-at-home opt-in. */
    foreground_only: z.boolean(),
    copy: z.string().min(1).max(60),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (!rule.id.startsWith(`${rule.form_id}#`)) issue('id must be <form_id>#<n>');
    const placed = rule.poi_refs.length + rule.geofences.length;
    if (rule.kind !== 'set_count' && placed === 0) issue(`${rule.kind} rules need a place`);
    if (rule.kind === 'any_of' && (rule.n ?? 1) > placed)
      issue('any_of asks for more places than it lists');
    if (rule.kind === 'set_count' && rule.n === null) issue('set_count rules need n');
    if (rule.kind === 'window' && rule.window_id === null) issue('window rules need window_id');
    if (rule.kind !== 'window' && rule.window_id !== null) issue('only window rules name a window');
    if (rule.kind === 'co_presence' && rule.min_members === null)
      issue('co_presence needs min_members');
    if (rule.kind !== 'co_presence' && rule.min_members !== null)
      issue('only co_presence sets min_members');
    if (rule.kind === 'any_of' && !/^At an? /u.test(rule.copy)) issue('any_of copy reads "At a …"');
  });
export type SpawnRuleItem = z.infer<typeof spawnRuleItemSchema>;
