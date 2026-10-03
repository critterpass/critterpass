/**
 * POI wire/domain shapes (docs/data-model.md §3.13, docs/api-contracts.md §4.17 `upsert_poi`).
 * Field names are snake_case to match the command/HTTP wire shape (docs/code-standards.md §3);
 * `packages/db/src/schema/places.ts` is the camelCase Drizzle mirror of the same columns.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';
import { ALLOW, deny, type PolicyActor, type PolicyResult } from '../policy/types';
import { timeZoneIdSchema } from '../time/canonical-tz';

import { poiCategorySchema } from './categories';
import { editorialOverlaySchema } from './editorial';

export const POI_STATUSES = ['active', 'closed', 'hidden'] as const;
export const poiStatusSchema = z.enum(POI_STATUSES);
export type PoiStatus = (typeof POI_STATUSES)[number];

/**
 * `auto` = conflated straight from FSQ OS Places / Overture with no editorial pass (the 55
 * guest-guide places); `editorial` = one of the 6 guide destinations, reviewed and overlaid by the
 * content factory. Hours are only ever quoted as verified for `editorial` rows with `hours_verified_at`
 * set.
 */
export const POI_CURATIONS = ['auto', 'editorial'] as const;
export const poiCurationSchema = z.enum(POI_CURATIONS);
export type PoiCuration = (typeof POI_CURATIONS)[number];

/** Provenance ids per source (docs/data-model.md §3.13 `source_ids jsonb`); used as conflation keys. */
export const poiSourceIdsSchema = z
  .object({
    fsq_os: z.string().min(1).optional(),
    overture: z.string().min(1).optional(),
    /** OpenStreetMap element, `n<id>`, `w<id>` or `r<id>` (node, way, relation). */
    osm: z
      .string()
      .regex(/^[nwr]\d+$/)
      .optional(),
    editorial: z.string().min(1).optional(),
  })
  .strict();
export type PoiSourceIds = z.infer<typeof poiSourceIdsSchema>;

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

/**
 * `upsert_poi` admin command payload (docs/api-contracts.md §4.17). `hours` stays a bounded record
 * here rather than importing `packages/domain/src/places/hours.ts`'s stricter shape: this is the
 * ingest/admin write boundary, while `hours.ts` owns interpreting whatever weekly-span shape ends up
 * stored (OSM-subset spans today, without a forward dependency from this file to that one).
 *
 * `destination_id`/`name`/`category`/`lat`/`lng` are only required when `id` is omitted (insert): an
 * update (`id` given) is a partial replace of only the fields the caller actually sent, matching how
 * an ops console edit form submits just what changed — the `.refine` below enforces that split
 * without needing a discriminated union at every call site.
 */
export const upsertPoiInputSchema = z
  .object({
    id: uuidV7Schema.optional(),
    destination_id: z.uuid().optional(),
    name: z.string().min(1).optional(),
    name_local: z.string().min(1).nullable().optional(),
    category: poiCategorySchema.optional(),
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
    address: z.string().min(1).nullable().optional(),
    hours: z.record(z.string(), z.unknown()).optional(),
    hours_verified_at: z.iso.datetime({ offset: true }).nullable().optional(),
    price_level: z.number().int().min(1).max(4).nullable().optional(),
    source_ids: poiSourceIdsSchema.optional(),
    editorial: editorialOverlaySchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    status: poiStatusSchema.optional(),
    curation: poiCurationSchema.optional(),
    merged_into_id: z.uuid().nullable().optional(),
    visit_radius_m: z.number().int().positive().nullable().optional(),
    timezone: timeZoneIdSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.id !== undefined ||
      (input.destination_id !== undefined &&
        input.name !== undefined &&
        input.category !== undefined &&
        input.lat !== undefined &&
        input.lng !== undefined),
    {
      message:
        'destination_id, name, category, lat and lng are required when id is omitted (insert)',
    },
  );
export type UpsertPoiInput = z.infer<typeof upsertPoiInputSchema>;

export const upsertPoiResultSchema = z.object({ id: z.uuid() });
export type UpsertPoiResult = z.infer<typeof upsertPoiResultSchema>;

/**
 * Content-role gate for `upsert_poi` (docs/api-contracts.md §4.17: role `content`). Kept standalone
 * from the shared `can()` dispatcher in `packages/domain/src/policy` rather than added there: that
 * dispatcher and the `/v1/admin/*` router it serves belong to the back-office admin console, which
 * does not exist yet. Sharing the same `PolicyActor`/`PolicyResult` contract makes wiring this into
 * `can()` later a one-line addition, not a rewrite.
 */
export function canUpsertPoi(actor: PolicyActor): PolicyResult {
  return actor.roles.includes('content') ? ALLOW : deny('FORBIDDEN');
}
