/**
 * `guide_reader` contract (docs/data-model-sync-and-privacy.md §2): the guide sees Postgres only
 * through `llm.*` views, each filtered by `app.uid`/`app.trip`, and no view is built on a table the
 * privacy registry classes above C2. Registry- and catalogue-driven, so tables added later are
 * covered without editing this file.
 */
import { getTablePrivacy, isPublishableClass, listRegisteredTables } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../../src/schema';
import { withGuideReader, withSystem } from '../../src/tx';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

beforeAll(async () => {
  void schema; // registers every table's privacy class
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  await withSystem(db.pool, async (tx) => {
    for (const uid of [fixture.actors.member, fixture.actors.organiser]) {
      await tx.query(
        "INSERT INTO user_settings (user_id, chattiness) VALUES ($1, 'chatty') ON CONFLICT (user_id) DO UPDATE SET chattiness = 'chatty'",
        [uid],
      );
    }
    await tx.query(
      `INSERT INTO persona_packs (guide_id, version, status)
       SELECT id, 'draft-only', 'draft' FROM guides WHERE slug = 'matrix-probe-guide'`,
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function asGuide<T extends object>(
  uid: string,
  sql: string,
  tripId = fixture.tripId,
): Promise<T[]> {
  return withGuideReader(db.pool, uid, tripId, async (tx) => (await tx.query<T>(sql)).rows);
}

describe('llm.trip_context', () => {
  it.each(['member', 'organiser'] as const)('gives the %s the trip in context', async (actor) => {
    const rows = await asGuide<{ trip_id: string; participants: Record<string, unknown>[] }>(
      fixture.actors[actor],
      'SELECT trip_id, participants FROM llm.trip_context',
    );
    expect(rows.map((r) => r.trip_id)).toEqual([fixture.tripId]);
    for (const participant of rows[0]!.participants) {
      expect(Object.keys(participant).sort()).toEqual(['display_name', 'role', 'rsvp', 'user_id']);
    }
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('gives the %s nothing', async (actor) => {
    expect(
      await asGuide(fixture.actors[actor], 'SELECT trip_id FROM llm.trip_context'),
    ).toHaveLength(0);
  });

  it('shows no trip when the context names a trip the caller is not on', async () => {
    const otherTrip = '0190f0a0-0000-7000-8000-00000000abcd';
    expect(
      await asGuide(fixture.actors.member, 'SELECT 1 FROM llm.trip_context', otherTrip),
    ).toHaveLength(0);
  });
});

describe('llm.user_prefs and llm.persona_packs', () => {
  it("returns only the asking user's own preferences", async () => {
    const rows = await asGuide<{ user_id: string; chattiness: string }>(
      fixture.actors.member,
      'SELECT user_id, chattiness FROM llm.user_prefs',
    );
    expect(rows).toEqual([{ user_id: fixture.actors.member, chattiness: 'chatty' }]);
  });

  it('exposes approved persona releases only', async () => {
    const rows = await asGuide<{ version: string }>(
      fixture.actors.member,
      "SELECT version FROM llm.persona_packs WHERE guide_slug = 'matrix-probe-guide'",
    );
    expect(rows.map((r) => r.version)).toEqual(['matrix-probe']);
  });
});

describe('guide_reader outside llm', () => {
  it('holds no SELECT on any app relation outside the llm schema', async () => {
    const { rows } = await db.pool.query<{ relation: string }>(
      `SELECT n.nspname || '.' || c.relname AS relation
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND n.nspname NOT IN ('llm', 'pg_catalog', 'information_schema')
         AND n.nspname NOT LIKE 'pg_toast%'
         -- Extension metadata (PostGIS spatial_ref_sys, geometry_columns, ...) is PUBLIC by design.
         AND NOT EXISTS (
           SELECT 1 FROM pg_depend e
           WHERE e.classid = 'pg_class'::regclass AND e.objid = c.oid AND e.deptype = 'e'
         )
         AND (has_table_privilege('guide_reader', c.oid, 'SELECT')
              OR has_any_column_privilege('guide_reader', c.oid, 'SELECT'))`,
    );
    expect(rows).toEqual([]);
  });

  it('is denied on every registered table present in the schema', async () => {
    const { rows } = await db.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const present = new Set(rows.map((r) => r.tablename));
    const registered = listRegisteredTables().filter((table) => present.has(table));
    expect(registered.length).toBeGreaterThan(20);
    for (const table of registered) {
      await expect(
        asGuide(fixture.actors.member, `SELECT 1 FROM "${table}" LIMIT 1`),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('builds every llm view only on registered tables classed C0-C2', async () => {
    const { rows } = await db.pool.query<{ view: string; table: string; schema: string }>(
      `SELECT DISTINCT v.relname AS view, t.relname AS table, tn.nspname AS schema
       FROM pg_class v
       JOIN pg_namespace vn ON vn.oid = v.relnamespace AND vn.nspname = 'llm'
       JOIN pg_rewrite r ON r.ev_class = v.oid
       JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass
       JOIN pg_class t ON t.oid = d.refobjid AND t.oid <> v.oid AND t.relkind IN ('r', 'p')
       JOIN pg_namespace tn ON tn.oid = t.relnamespace`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const { view, table, schema: nsp } of rows) {
      expect(nsp, `${view} -> ${table}`).toBe('public');
      const privacy = getTablePrivacy(table);
      expect(privacy, `${view} -> ${table} has no privacy class`).toBeDefined();
      expect(isPublishableClass(privacy!.class), `${view} -> ${table} is ${privacy!.class}`).toBe(
        true,
      );
    }
  });
});
