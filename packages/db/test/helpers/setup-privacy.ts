/**
 * Shared checks for the trip setup permission suites: what a table shows each fixture actor, and
 * the proof that a C3 table is sealed from everyone but its owner (peers, the organiser,
 * guide_reader, powersync_repl, the publication and every sync stream).
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { expect } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import type { ActorKind } from './fixtures';
import { streamQueries, type StreamHarness } from './stream-harness';

const DENIED = /permission denied|row-level security/i;

/** Rows `uid` sees for `sql`; a permission error counts as none. */
export async function visibleRows(
  harness: StreamHarness,
  uid: string,
  sql: string,
  params: readonly unknown[] = [],
): Promise<number> {
  try {
    const result = await withUser(harness.db.pool, uid, randomUUID(), (tx) =>
      tx.query(sql, [...params]),
    );
    return result.rowCount ?? 0;
  } catch (error) {
    if (error instanceof Error && DENIED.test(error.message)) return 0;
    throw error;
  }
}

/** Runs `sql` as `role` on the owner connection (no app.uid), inside a rolled-back transaction. */
export async function asRole<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  role: 'powersync_repl' | 'admin_reader',
  sql: string,
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await client.query<T>(sql);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** Every stream table any sync stream reads (outer tables and subqueries alike). */
export function streamedTables(harness: StreamHarness): ReadonlySet<string> {
  const tables = new Set<string>();
  for (const name of Object.keys(harness.config.streams)) {
    for (const query of streamQueries(harness.config, name)) tables.add(query.table);
  }
  return tables;
}

/**
 * A C3 table: `owner` may be the only reader (or nobody, for write-only tables); every other
 * fixture actor, guide_reader and powersync_repl read nothing; it is in no publication and no
 * stream.
 */
export async function expectSealed(
  harness: StreamHarness,
  table: string,
  options: { readonly owner: ActorKind | null },
): Promise<void> {
  const { actors } = harness.fixture;
  const probe = `SELECT 1 FROM ${table}`;
  for (const [kind, uid] of Object.entries(actors) as [ActorKind, string][]) {
    const seen = await visibleRows(harness, uid, probe);
    if (kind === options.owner) expect(seen, `${table} as its owner`).toBeGreaterThan(0);
    else expect(seen, `${table} as ${kind}`).toBe(0);
  }
  await expect(
    withGuideReader(harness.db.pool, actors.organiser, harness.fixture.tripId, (tx) =>
      tx.query(probe),
    ),
  ).rejects.toThrow(/permission denied/i);
  await expect(asRole(harness.db.pool, 'powersync_repl', probe)).rejects.toThrow(
    /permission denied/i,
  );
  const { rows } = await harness.db.pool.query(
    'SELECT pubname FROM pg_publication_tables WHERE tablename = $1',
    [table],
  );
  expect(rows, `${table} publications`).toEqual([]);
  const grants = await harness.db.pool.query(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = $1 AND grantee IN ('guide_reader', 'powersync_repl')`,
    [table],
  );
  expect(grants.rows, `${table} grants to guide_reader / powersync_repl`).toEqual([]);
  expect(streamedTables(harness).has(table), `${table} in a sync stream`).toBe(false);
}

/**
 * A derived C1 setup table: active crew members of the fixture trip read it, the outsider, the
 * ex-member and an anonymous uid do not, nobody writes it through app_user, and it is published
 * and carried by the `trip` stream to members only.
 */
export async function expectCrewReadOnly(harness: StreamHarness, table: string): Promise<void> {
  const { actors, tripId } = harness.fixture;
  const probe = `SELECT 1 FROM ${table} WHERE trip_id = $1`;
  for (const kind of ['member', 'organiser', 'coOrganiser'] as const) {
    expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBeGreaterThan(0);
  }
  for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
    expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
  }
  await expect(
    withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
      tx.query(`UPDATE ${table} SET trip_id = trip_id WHERE trip_id = $1`, [tripId]),
    ),
  ).rejects.toThrow(/permission denied/i);
  const { rows } = await harness.db.pool.query(
    "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = $1",
    [table],
  );
  expect(rows).toHaveLength(1);
  for (const kind of ['member', 'organiser'] as const) {
    const synced = await harness.rows('trip', kind, { trip_id: tripId });
    expect(synced.get(table)?.length ?? 0, `${table} streamed to ${kind}`).toBeGreaterThan(0);
  }
  for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
    const synced = await harness.rows('trip', kind, { trip_id: tripId });
    expect(synced.get(table)?.length ?? 0, `${table} streamed to ${kind}`).toBe(0);
  }
}
