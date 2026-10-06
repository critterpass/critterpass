/**
 * RLS backstop fuzz: random worlds of users, crews and trips that share nothing, then every user
 * (plus an unknown uid per world) attacks every other world's rows in every RLS table through the
 * request role: SELECT, UPDATE, DELETE, and INSERT of a copied row moved into the attacker's name.
 * Any row reached is a leak, whatever the table. Tables every outsider may read (the permission
 * matrix says so) are exempt from the SELECT check only.
 *
 * The read-only roles are checked from the catalog: none may write anywhere, and `app_user` holds
 * no privilege on a public table without RLS.
 *
 * Reproduce a run with `FUZZ_SEED=<seed> pnpm --filter @cp/db test -- fuzz`.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { buildPermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { TABLE_MATRIX } from '../permissions/_matrix';
import {
  fixtureWorld,
  foreignIds,
  foreignRowFilter,
  fuzzDevice,
  generateWorld,
  loadFuzzTables,
  quote,
  seededRandom,
  shuffle,
  type FuzzTable,
  type Scope,
  type World,
} from './generators';

const SEED = Number(process.env.FUZZ_SEED ?? Date.now() % 4_294_967_296);
const GENERATED_WORLDS = 8;
const MIN_ITERATIONS = 10_000;

let container: DbTestContainer;
let db: DbTestDatabase;
let worlds: World[];
let tables: FuzzTable[];

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  const random = seededRandom(SEED);
  worlds = [fixtureWorld(await buildPermissionFixture(db.pool))];
  for (let i = 0; i < GENERATED_WORLDS; i += 1) worlds.push(await generateWorld(db.pool, random));
  tables = await loadFuzzTables(db.pool);
}, 240_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function publiclyReadable(table: string): boolean {
  const entry = TABLE_MATRIX[table];
  return (
    entry?.expectations.outsider.select === true || entry?.expectations.anonymous.select === true
  );
}

interface Leak {
  readonly table: string;
  readonly op: string;
  readonly attacker: string;
  readonly detail: string;
}

function errorCode(error: unknown): string {
  return (error as { code?: unknown }).code?.toString() ?? 'unknown';
}

/** Runs one probe inside a savepoint that is always rolled back; returns rows or the error. */
async function probe(
  tx: pg.PoolClient,
  sql: string,
  params: readonly unknown[],
): Promise<{ rows: number } | { error: string; message: string }> {
  await tx.query('SAVEPOINT fuzz');
  try {
    const result = await tx.query(sql, params as unknown[]);
    return { rows: result.rowCount ?? 0 };
  } catch (error) {
    return { error: errorCode(error), message: (error as Error).message };
  } finally {
    await tx.query('ROLLBACK TO SAVEPOINT fuzz');
  }
}

/** One foreign row per table, as JSON, ready to be copied into the attacker's name. */
async function sampleForeignRows(
  foreign: Record<Scope, string[]>,
): Promise<Map<string, Record<string, unknown>>> {
  const samples = new Map<string, Record<string, unknown>>();
  for (const table of tables) {
    const filter = foreignRowFilter(table, foreign);
    const { rows } = await db.pool.query<{ row: Record<string, unknown> }>(
      `SELECT to_jsonb(t) AS row FROM ${quote(table.name)} t WHERE ${filter.sql} LIMIT 1`,
      filter.params,
    );
    if (rows[0] !== undefined) samples.set(table.name, rows[0].row);
  }
  return samples;
}

/** The copied row keeps its foreign crew/trip but claims the attacker as its user. */
function moveIntoAttackersName(
  table: FuzzTable,
  row: Record<string, unknown>,
  attacker: string,
  foreign: Record<Scope, string[]>,
): Record<string, unknown> {
  const copy = { ...row };
  if (table.hasUuidId) copy.id = randomUUID();
  const groupScoped = table.scopeColumns.some(
    (sc) => sc.scope !== 'user' && foreign[sc.scope].includes(String(row[sc.column])),
  );
  if (groupScoped && 'user_id' in copy) copy.user_id = attacker;
  return copy;
}

async function attack(
  attacker: string,
  samples: Map<string, Record<string, unknown>>,
  foreign: Record<Scope, string[]>,
  leaks: Leak[],
  random: () => number,
): Promise<number> {
  let iterations = 0;
  await withUser(db.pool, attacker, fuzzDevice(), async (tx) => {
    for (const table of shuffle(random, tables)) {
      const filter = foreignRowFilter(table, foreign);
      const target = `${quote(table.name)} WHERE ${filter.sql}`;
      const report = (op: string, detail: string) =>
        leaks.push({ table: table.name, op, attacker, detail });

      iterations += 1;
      const read = await probe(tx, `SELECT 1 FROM ${target}`, filter.params);
      if ('rows' in read && read.rows > 0 && !publiclyReadable(table.name)) {
        report('select', `${read.rows} foreign rows visible`);
      } else if ('error' in read && read.error !== '42501') {
        report('select', `${read.error} ${read.message}`);
      }

      iterations += 1;
      if (table.updatableColumn !== undefined) {
        const col = quote(table.updatableColumn);
        const write = await probe(
          tx,
          `UPDATE ${target.replace(' WHERE', ` SET ${col} = ${col} WHERE`)}`,
          filter.params,
        );
        if ('rows' in write && write.rows > 0)
          report('update', `${write.rows} foreign rows updated`);
        else if ('error' in write && write.error !== '42501') {
          report('update', `${write.error} ${write.message}`);
        }
      }

      iterations += 1;
      const removed = await probe(tx, `DELETE FROM ${target}`, filter.params);
      if ('rows' in removed && removed.rows > 0)
        report('delete', `${removed.rows} foreign rows deleted`);

      iterations += 1;
      const sample = samples.get(table.name);
      if (sample !== undefined) {
        const cols = table.insertColumns.map(quote).join(', ');
        const row = moveIntoAttackersName(table, sample, attacker, foreign);
        const inserted = await probe(
          tx,
          `INSERT INTO ${quote(table.name)} (${cols})
           SELECT ${cols} FROM jsonb_populate_record(NULL::${quote(table.name)}, $1::jsonb)`,
          [JSON.stringify(row)],
        );
        if ('rows' in inserted && inserted.rows > 0)
          report('insert', 'row inserted into a foreign scope');
      }
    }
  });
  return iterations;
}

describe('RLS backstop fuzz', { timeout: 900_000 }, () => {
  it(`never lets a user reach another world's rows (seed ${SEED})`, async () => {
    const random = seededRandom(SEED ^ 0x9e3779b9);
    const leaks: Leak[] = [];
    let iterations = 0;
    for (const world of worlds) {
      const foreign = foreignIds(worlds, world);
      const samples = await sampleForeignRows(foreign);
      const attackers = [...world.userIds, randomUUID()];
      for (const attacker of attackers) {
        iterations += await attack(attacker, samples, foreign, leaks, random);
      }
    }
    expect(tables.length).toBeGreaterThan(50);
    expect(iterations).toBeGreaterThanOrEqual(MIN_ITERATIONS);
    expect(leaks, `seed ${SEED}`).toEqual([]);
  });
});

describe('role catalog', () => {
  it('gives the read-only roles no write privilege on any table', async () => {
    const { rows } = await db.pool.query<{ grantee: string; table: string; privilege: string }>(
      `SELECT grantee, table_schema || '.' || table_name AS table, privilege_type AS privilege
       FROM information_schema.role_table_grants
       WHERE grantee IN ('guide_reader', 'powersync_repl', 'monitoring_reader', 'admin_reader')
         AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`,
    );
    expect(rows).toEqual([]);
  });

  it('gives app_user nothing on a public table without RLS', async () => {
    const { rows } = await db.pool.query<{ table: string }>(
      `SELECT c.relname AS table
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
         -- Extension catalogs (PostGIS spatial_ref_sys) are public reference data.
         AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
         AND (has_table_privilege('app_user', c.oid, 'SELECT')
           OR has_table_privilege('app_user', c.oid, 'INSERT')
           OR has_table_privilege('app_user', c.oid, 'UPDATE')
           OR has_table_privilege('app_user', c.oid, 'DELETE'))`,
    );
    expect(rows).toEqual([]);
  });
});
