/**
 * Low-level insert helpers for the plan tables (itinerary_versions, plan_days, plan_items,
 * change_sets), mirroring ./actors.ts's shape for the identity/crew/trip tables.
 */
import type pg from 'pg';

import { firstRow, randomId } from './actors';

export interface InsertItineraryVersionOptions {
  readonly tripId: string;
  readonly visibility?: 'organiser' | 'crew';
  readonly status?: string;
  readonly parentId?: string;
}

export async function insertItineraryVersion(
  client: pg.PoolClient | pg.Pool,
  options: InsertItineraryVersionOptions,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO itinerary_versions (trip_id, visibility, status, parent_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [options.tripId, options.visibility ?? 'crew', options.status ?? 'current', options.parentId ?? null],
  );
  return firstRow(rows).id;
}

export interface InsertPlanDayOptions {
  readonly versionId: string;
  readonly tripId: string;
  readonly dayNo: number;
}

export async function insertPlanDay(
  client: pg.PoolClient | pg.Pool,
  options: InsertPlanDayOptions,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, $3) RETURNING id',
    [options.versionId, options.tripId, options.dayNo],
  );
  return firstRow(rows).id;
}

export interface InsertPlanItemOptions {
  readonly versionId: string;
  readonly dayId: string;
  readonly tripId: string;
  readonly stableId?: string;
  readonly category?: string;
}

export interface PlanItemRef {
  readonly id: string;
  readonly stableId: string;
}

export async function insertPlanItem(
  client: pg.PoolClient | pg.Pool,
  options: InsertPlanItemOptions,
): Promise<PlanItemRef> {
  const stableId = options.stableId ?? randomId();
  const { rows } = await client.query<{ id: string; stable_id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, category)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, stable_id`,
    [options.versionId, options.dayId, options.tripId, stableId, options.category ?? 'sightseeing'],
  );
  const row = firstRow(rows);
  return { id: row.id, stableId: row.stable_id };
}

export interface InsertChangeSetOptions {
  readonly tripId: string;
  readonly baseVersionId: string;
  readonly authorId: string;
  readonly authorKind?: 'user' | 'guide';
  readonly trigger?: string;
  readonly scope?: 'group' | 'personal';
  readonly ops: unknown;
  readonly status?: string;
}

export async function insertChangeSet(
  client: pg.PoolClient | pg.Pool,
  options: InsertChangeSetOptions,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      options.tripId,
      options.baseVersionId,
      options.trigger ?? 'manual',
      options.scope ?? 'group',
      options.authorKind ?? 'user',
      options.authorId,
      options.status ?? 'draft',
      JSON.stringify(options.ops),
    ],
  );
  return firstRow(rows).id;
}
