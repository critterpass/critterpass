/**
 * Catalogue area: keyset lists and detail reads per kind (as `admin_reader`), and
 * `upsert_catalogue_item` with an optimistic-concurrency check on the row's `updated_at` token
 * (stale → VERSION_CONFLICT with the current values, so the console can show the diff). POIs go
 * through the places handler (`upsert_poi`), which writes its own audit row. Every change tells
 * clients to refetch on the `catalog` channel.
 */
import { enqueueRealtime } from '@cp/db';
import {
  CATALOG_CHANNEL,
  CATALOGUE_EDIT_SCHEMAS,
  CREATABLE_CATALOGUE_KINDS,
  DomainError,
  adminPageQuerySchema,
  adminPageSchema,
  catalogueItemSchema,
  catalogueKindSchema,
  effectiveAdminRoles,
  upsertCatalogueItemPayloadSchema,
  upsertPoiInputSchema,
  type CatalogueKind,
  type PolicyActor,
  type UpsertPoiInput,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { handleUpsertPoi } from '../places/admin-upsert-poi';
import { decodeCursor, encodeCursor, withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminCommand,
  defineAdminRead,
  type AdminIdentity,
} from './registry';

interface KindTable {
  readonly table: string;
  readonly data: readonly string[];
  readonly locked: readonly string[];
  /** Columns sent as jsonb. */
  readonly json: readonly string[];
}

const KINDS: Readonly<Record<CatalogueKind, KindTable>> = {
  guides: {
    table: 'guides',
    data: ['name', 'voice_id', 'persona_pack_version', 'local_words'],
    locked: ['slug', 'colour'],
    json: ['local_words'],
  },
  destinations: {
    table: 'destinations',
    data: ['slug', 'name', 'country', 'coverage', 'colour', 'currency', 'tz', 'best_months'],
    locked: [],
    json: [],
  },
  pois: {
    table: 'pois',
    data: [
      'destination_id',
      'name',
      'name_local',
      'category',
      'lat',
      'lng',
      'address',
      'status',
      'curation',
      'tags',
      'visit_radius_m',
    ],
    locked: [],
    json: [],
  },
};

/** Microsecond `updated_at`: every update bumps it (touch trigger), so it is the row's version. */
const VERSION_SQL = 'floor(extract(epoch from updated_at) * 1000000)::bigint::text';
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

type Row = Record<string, unknown> & { id: string; version: string; name: string };

function toItem(kind: CatalogueKind, row: Row) {
  const spec = KINDS[kind];
  return catalogueItemSchema.parse({
    id: row.id,
    version: row.version,
    title: row.name,
    data: Object.fromEntries(spec.data.map((column) => [column, row[column] ?? null])),
    locked: Object.fromEntries(spec.locked.map((column) => [column, row[column] ?? null])),
  });
}

function selectList(kind: CatalogueKind): string {
  const spec = KINDS[kind];
  return [
    'id::text AS id',
    `${VERSION_SQL} AS version`,
    ...new Set([...spec.data, ...spec.locked]),
  ].join(', ');
}

async function lockRow(tx: pg.PoolClient, kind: CatalogueKind, id: string): Promise<Row> {
  const { rows } = await tx.query<Row>(
    `SELECT ${selectList(kind)} FROM ${KINDS[kind].table} WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND');
  return row;
}

async function readVersion(tx: pg.PoolClient, kind: CatalogueKind, id: string): Promise<string> {
  const { rows } = await tx.query<{ version: string }>(
    `SELECT ${VERSION_SQL} AS version FROM ${KINDS[kind].table} WHERE id = $1`,
    [id],
  );
  return rows[0]?.version ?? '';
}

/** A write the database refuses on a constraint is the operator's input, not a server fault. */
async function constrained<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === PG_UNIQUE_VIOLATION || code === PG_CHECK_VIOLATION) {
      throw new DomainError('VALIDATION', {
        reason: code === PG_UNIQUE_VIOLATION ? 'duplicate' : 'constraint',
        constraint: (error as { constraint?: unknown }).constraint ?? null,
      });
    }
    throw error;
  }
}

async function writeRow(
  tx: pg.PoolClient,
  kind: 'guides' | 'destinations',
  id: string | undefined,
  data: Record<string, unknown>,
): Promise<string> {
  const spec = KINDS[kind];
  const columns = spec.data;
  const values = columns.map((column) =>
    spec.json.includes(column) ? JSON.stringify(data[column] ?? {}) : (data[column] ?? null),
  );
  const casts = columns.map((column, index) =>
    spec.json.includes(column) ? `$${index + 1}::jsonb` : `$${index + 1}`,
  );
  if (id === undefined) {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO ${spec.table} (${columns.join(', ')}) VALUES (${casts.join(', ')}) RETURNING id`,
      values,
    );
    return rows[0]?.id ?? '';
  }
  const sets = columns.map((column, index) => `${column} = ${casts[index] ?? ''}`).join(', ');
  await tx.query(`UPDATE ${spec.table} SET ${sets} WHERE id = $${columns.length + 1}`, [
    ...values,
    id,
  ]);
  return id;
}

function poiActor(admin: AdminIdentity): PolicyActor {
  return {
    uid: admin.uid,
    isAnonymous: false,
    roles: effectiveAdminRoles(admin.roles),
    via: 'admin',
  };
}

const pageQuery = adminPageQuerySchema;
const kindParams = z.object({ kind: catalogueKindSchema });

export function catalogueArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'catalogue',
    reads: [
      defineAdminRead({
        path: '/catalogue/{kind}',
        area: 'catalogue',
        summary: 'One page of a catalogue kind, by name',
        query: pageQuery,
        params: kindParams,
        response: adminPageSchema(catalogueItemSchema),
        run: ({ admin, query, params }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const after = decodeCursor(query.cursor);
            const { rows } = await tx.query<Row>(
              `SELECT ${selectList(params.kind)} FROM ${KINDS[params.kind].table}
               WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
                 AND ($2::text IS NULL OR (name, id) > ($2, $3::uuid))
               ORDER BY name, id LIMIT $4`,
              [query.q ?? null, after?.[0] ?? null, after?.[1] ?? null, query.limit + 1],
            );
            const page = rows.slice(0, query.limit);
            const last = page[page.length - 1];
            return {
              items: page.map((row) => toItem(params.kind, row)),
              next_cursor:
                rows.length > query.limit && last !== undefined
                  ? encodeCursor(last.name, last.id)
                  : null,
            };
          }),
      }),
      defineAdminRead({
        path: '/catalogue/{kind}/{id}',
        area: 'catalogue',
        summary: 'One catalogue item with its version token',
        params: kindParams.extend({ id: z.uuid() }),
        response: catalogueItemSchema,
        run: ({ admin, params }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<Row>(
              `SELECT ${selectList(params.kind)} FROM ${KINDS[params.kind].table} WHERE id = $1`,
              [params.id],
            );
            const row = rows[0];
            if (row === undefined) throw new DomainError('NOT_FOUND');
            return toItem(params.kind, row);
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'upsert_catalogue_item',
        schema: upsertCatalogueItemPayloadSchema,
        audit: (payload, result: { id: string; version: string }) =>
          payload.kind === 'pois'
            ? 'self'
            : {
                targetKind: payload.kind,
                targetId: result.id,
                detail: { fields: Object.keys(payload.data).sort() },
              },
        handle: async (tx, payload, ctx) => {
          const data = CATALOGUE_EDIT_SCHEMAS[payload.kind].parse(payload.data);
          if (payload.id === undefined) {
            if (!CREATABLE_CATALOGUE_KINDS.includes(payload.kind)) {
              throw new DomainError('STATE_INVALID', { reason: 'not_creatable' });
            }
          } else {
            const current = await lockRow(tx, payload.kind, payload.id);
            if (current.version !== payload.version) {
              throw new DomainError('VERSION_CONFLICT', {
                current_version: current.version,
                current: toItem(payload.kind, current).data,
              });
            }
          }
          const id = await constrained(async () =>
            payload.kind === 'pois'
              ? (
                  await handleUpsertPoi(tx, poiActor(ctx.admin), {
                    ...(data as UpsertPoiInput),
                    ...(payload.id !== undefined ? { id: payload.id } : {}),
                  })
                ).id
              : writeRow(tx, payload.kind, payload.id, data),
          );
          await enqueueRealtime(tx, {
            channel: CATALOG_CHANNEL,
            payload: { type: 'catalogue.changed', kind: payload.kind, id },
          });
          return { id, version: await readVersion(tx, payload.kind, id) };
        },
      }),
      defineAdminCommand({
        name: 'upsert_poi',
        schema: upsertPoiInputSchema,
        audit: 'self',
        handle: (tx, payload, ctx) =>
          constrained(() => handleUpsertPoi(tx, poiActor(ctx.admin), payload)),
      }),
    ],
  });
}
