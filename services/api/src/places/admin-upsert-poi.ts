/**
 * `upsert_poi` (docs/api-contracts.md §4.17: ops console content role). Exported as a plain
 * `{contract, policy, handle}` module matching the documented command-handler shape
 * (docs/code-standards.md §10) rather than mounted as a route: `/v1/admin/*` routing and its
 * auth-guard belong entirely to the back-office admin console's own
 * `services/api/src/admin/{router,auth-guard,registry}.ts` (not yet built), which can import and
 * register this handler without touching this file. Writes `ops.admin_audit` in the same transaction
 * as the write, the same "adm, no console yet" convention `destinations`/`guides` already use.
 *
 * `tx` must come from `withSystem`, not `withUser`: `pois` and `ops.admin_audit` both grant writes
 * only to `app_system` (docs/data-model.md §3.13, §3.16) — the future admin registry runs every
 * admin command that way regardless of the human caller, with `actor` carrying the real identity for
 * the audit row and the `canUpsertPoi` role check above.
 */
import {
  canUpsertPoi,
  defaultVisitRadiusM,
  upsertPoiInputSchema,
  upsertPoiResultSchema,
  DomainError,
  type PolicyActor,
  type UpsertPoiInput,
  type UpsertPoiResult,
} from '@cp/domain';
import type pg from 'pg';

export const upsertPoiContract = {
  name: 'upsert_poi' as const,
  input: upsertPoiInputSchema,
  result: upsertPoiResultSchema,
};

export const upsertPoiPolicy = canUpsertPoi;

async function auditUpsert(tx: pg.PoolClient, actor: PolicyActor, poiId: string): Promise<void> {
  await tx.query(
    "INSERT INTO ops.admin_audit (admin_id, action, target_kind, target_id) VALUES ($1, 'upsert_poi', 'poi', $2)",
    [actor.uid, poiId],
  );
}

/**
 * Inserts a new POI (`input.id` omitted) or updates an existing one (`input.id` given). Every field
 * not present in `input` is left as-is on an update, or takes its column default on an insert —
 * this is a full replace of only the fields the caller actually sent, matching how an ops console
 * edit form would submit just the fields it changed.
 */
export async function handleUpsertPoi(
  tx: pg.PoolClient,
  actor: PolicyActor,
  input: UpsertPoiInput,
): Promise<UpsertPoiResult> {
  const decision = canUpsertPoi(actor);
  if (!decision.ok) throw new DomainError(decision.deny);

  if (input.id === undefined) {
    // Mirrors upsertPoiInputSchema's own `.refine`: re-checked here (not just trusted from a prior
    // `.parse()`) since this handler is also directly callable by a future admin registry.
    if (
      input.destination_id === undefined ||
      input.name === undefined ||
      input.category === undefined ||
      input.lat === undefined ||
      input.lng === undefined
    ) {
      throw new DomainError('VALIDATION', {
        reason: 'destination_id, name, category, lat and lng are required when id is omitted',
      });
    }
    const visitRadiusM = input.visit_radius_m ?? defaultVisitRadiusM(input.category);

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois
         (destination_id, name, name_local, category, lat, lng, address, hours, hours_verified_at,
          price_level, source_ids, editorial, tags, status, curation, merged_into_id, visit_radius_m,
          timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::jsonb, '{}'::jsonb), $9, $10,
               coalesce($11::jsonb, '{}'::jsonb), coalesce($12::jsonb, '{}'::jsonb), coalesce($13::text[], '{}'::text[]),
               coalesce($14, 'active'), coalesce($15, 'editorial'), $16, $17, $18)
       RETURNING id`,
      [
        input.destination_id,
        input.name,
        input.name_local ?? null,
        input.category,
        input.lat,
        input.lng,
        input.address ?? null,
        input.hours !== undefined ? JSON.stringify(input.hours) : null,
        input.hours_verified_at ?? null,
        input.price_level ?? null,
        input.source_ids !== undefined ? JSON.stringify(input.source_ids) : null,
        input.editorial !== undefined ? JSON.stringify(input.editorial) : null,
        input.tags ?? null,
        input.status ?? null,
        input.curation ?? null,
        input.merged_into_id ?? null,
        visitRadiusM,
        input.timezone ?? null,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined)
      throw new DomainError('INTERNAL', { reason: 'upsert_poi insert returned no id' });
    await auditUpsert(tx, actor, id);
    return { id };
  }

  const { rows } = await tx.query<{ id: string }>(
    `UPDATE pois SET
       destination_id = coalesce($2, destination_id),
       name = coalesce($3, name),
       name_local = coalesce($4, name_local),
       category = coalesce($5, category),
       lat = coalesce($6, lat),
       lng = coalesce($7, lng),
       address = coalesce($8, address),
       hours = coalesce($9::jsonb, hours),
       hours_verified_at = coalesce($10, hours_verified_at),
       price_level = coalesce($11, price_level),
       source_ids = coalesce($12::jsonb, source_ids),
       editorial = coalesce($13::jsonb, editorial),
       tags = coalesce($14::text[], tags),
       status = coalesce($15, status),
       curation = coalesce($16, curation),
       merged_into_id = coalesce($17, merged_into_id),
       visit_radius_m = coalesce($18, visit_radius_m),
       timezone = coalesce($19, timezone)
     WHERE id = $1
     RETURNING id`,
    [
      input.id,
      input.destination_id ?? null,
      input.name ?? null,
      input.name_local ?? null,
      input.category ?? null,
      input.lat ?? null,
      input.lng ?? null,
      input.address ?? null,
      input.hours !== undefined ? JSON.stringify(input.hours) : null,
      input.hours_verified_at ?? null,
      input.price_level ?? null,
      input.source_ids !== undefined ? JSON.stringify(input.source_ids) : null,
      input.editorial !== undefined ? JSON.stringify(input.editorial) : null,
      input.tags ?? null,
      input.status ?? null,
      input.curation ?? null,
      input.merged_into_id ?? null,
      input.visit_radius_m ?? null,
      input.timezone ?? null,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined)
    throw new DomainError('NOT_FOUND', { reason: 'poi not found', poiId: input.id });
  await auditUpsert(tx, actor, id);
  return { id };
}

export const upsertPoi = {
  contract: upsertPoiContract,
  policy: upsertPoiPolicy,
  handle: handleUpsertPoi,
};
