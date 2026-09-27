/**
 * `handleUpsertPoi` against real Postgres (Testcontainers): insert/update branching, the content-role
 * policy gate, and the `ops.admin_audit` write. Must run via `withSystem` (see the file header of
 * `../../src/places/admin-upsert-poi.ts`) since `pois`/`ops.admin_audit` grant writes only to
 * `app_system`.
 */
import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type { PolicyActor } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handleUpsertPoi } from '../../src/places/admin-upsert-poi';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;

const CONTENT_ACTOR: PolicyActor = {
  uid: '00000000-0000-7000-8000-000000000020',
  isAnonymous: false,
  roles: ['content'],
  via: 'admin',
};
const NON_CONTENT_ACTOR: PolicyActor = { ...CONTENT_ACTOR, roles: [] };

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);

  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto', 'Kyoto', 'live') RETURNING id",
  );
  destinationId = rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

describe('handleUpsertPoi', () => {
  it('rejects a non-content actor outright, without writing anything', async () => {
    await expect(
      withSystem(pool, (tx) =>
        handleUpsertPoi(tx, NON_CONTENT_ACTOR, {
          destination_id: destinationId,
          name: 'Should not exist',
          category: 'other',
          lat: 0,
          lng: 0,
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const { rows } = await pool.query('SELECT 1 FROM pois WHERE name = $1', ['Should not exist']);
    expect(rows).toHaveLength(0);
  });

  it('inserts a new POI, defaults visit_radius_m by category, and audits the write', async () => {
    const result = await withSystem(pool, (tx) =>
      handleUpsertPoi(tx, CONTENT_ACTOR, {
        destination_id: destinationId,
        name: 'Nishiki Market',
        category: 'market',
        lat: 35.0051,
        lng: 135.7651,
      }),
    );

    const { rows } = await pool.query<{ visit_radius_m: number; curation: string }>(
      'SELECT visit_radius_m, curation FROM pois WHERE id = $1',
      [result.id],
    );
    expect(rows[0]).toEqual({ visit_radius_m: 80, curation: 'editorial' });

    const audit = await pool.query<{ action: string; target_id: string }>(
      "SELECT action, target_id FROM ops.admin_audit WHERE target_id = $1 AND action = 'upsert_poi'",
      [result.id],
    );
    expect(audit.rows).toEqual([{ action: 'upsert_poi', target_id: result.id }]);
  });

  it('updates only the fields given, leaving the rest untouched', async () => {
    const created = await withSystem(pool, (tx) =>
      handleUpsertPoi(tx, CONTENT_ACTOR, {
        destination_id: destinationId,
        name: 'Original Name',
        category: 'food',
        lat: 35.0,
        lng: 135.0,
        price_level: 2,
      }),
    );

    await withSystem(pool, (tx) =>
      handleUpsertPoi(tx, CONTENT_ACTOR, { id: created.id, price_level: 3 }),
    );

    const { rows } = await pool.query<{ name: string; category: string; price_level: number }>(
      'SELECT name, category, price_level FROM pois WHERE id = $1',
      [created.id],
    );
    expect(rows[0]).toEqual({ name: 'Original Name', category: 'food', price_level: 3 });
  });

  it('throws NOT_FOUND when updating a POI id that does not exist', async () => {
    await expect(
      withSystem(pool, (tx) =>
        handleUpsertPoi(tx, CONTENT_ACTOR, {
          id: '00000000-0000-7000-8000-0000000000ff',
          name: 'Ghost',
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
