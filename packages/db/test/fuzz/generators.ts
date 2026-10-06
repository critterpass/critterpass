/**
 * Random worlds for the RLS backstop fuzz. A world is a set of users, crews and trips that share
 * nothing with any other world, so any row of another world an actor can read, update, delete or
 * insert next to is a leak whatever the table's own policy says.
 *
 * World 0 is the rich permission fixture (one row in nearly every table). The rest are generated
 * from a seeded PRNG: random crew sizes, organiser/member roles, active/left/removed statuses and
 * trips with a random subset of participants, so the attackers cover every membership shape.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import {
  anonymousActor,
  insertCrew,
  insertCrewMember,
  insertTrip,
  insertTripParticipant,
  insertUser,
} from '../helpers/actors';
import type { PermissionFixture } from '../helpers/fixtures';

export interface World {
  readonly userIds: readonly string[];
  readonly crewIds: readonly string[];
  readonly tripIds: readonly string[];
}

export type Scope = 'user' | 'crew' | 'trip';

/** A column whose value ties a row to a user, crew or trip. */
export interface ScopeColumn {
  readonly column: string;
  readonly scope: Scope;
}

export interface FuzzTable {
  readonly name: string;
  readonly scopeColumns: readonly ScopeColumn[];
  /** Insertable columns (not generated, not identity-always), in table order. */
  readonly insertColumns: readonly string[];
  /** A column `app_user` may UPDATE, if any. */
  readonly updatableColumn: string | undefined;
  readonly hasUuidId: boolean;
}

export type Random = () => number;

/** mulberry32: small, fast and reproducible from one 32-bit seed. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

const MEMBER_STATUSES = ['active', 'active', 'active', 'left', 'removed'] as const;

/** One crew of two to five users with random roles and statuses, and one or two trips. */
export async function generateWorld(pool: pg.Pool, random: Random): Promise<World> {
  return withSystem(pool, async (tx) => {
    const size = 2 + Math.floor(random() * 4);
    const userIds: string[] = [];
    for (let i = 0; i < size; i += 1) userIds.push(await insertUser(tx));
    const [founder] = userIds as [string];
    const crewId = await insertCrew(tx, { createdBy: founder, name: 'Fuzz crew' });
    for (const [index, userId] of userIds.entries()) {
      await insertCrewMember(tx, {
        crewId,
        userId,
        role: index === 0 || random() < 0.2 ? 'organiser' : 'member',
        status: index === 0 ? 'active' : pick(random, MEMBER_STATUSES),
        keepInChat: random() < 0.5,
      });
    }
    const tripIds: string[] = [];
    const trips = 1 + Math.floor(random() * 2);
    for (let t = 0; t < trips; t += 1) {
      const tripId = await insertTrip(tx, { crewId });
      tripIds.push(tripId);
      for (const [index, userId] of userIds.entries()) {
        if (index !== 0 && random() < 0.4) continue;
        await insertTripParticipant(tx, {
          tripId,
          userId,
          role: index === 0 ? 'organiser' : 'member',
        });
      }
    }
    return { userIds, crewIds: [crewId], tripIds };
  });
}

export function fixtureWorld(fixture: PermissionFixture): World {
  return {
    userIds: Object.values(fixture.actors),
    crewIds: [fixture.crewId],
    tripIds: [fixture.tripId],
  };
}

/** Every id of every world except `self`, by scope: the rows `self`'s users must never reach. */
export function foreignIds(worlds: readonly World[], self: World): Record<Scope, string[]> {
  const others = worlds.filter((w) => w !== self);
  return {
    user: others.flatMap((w) => w.userIds),
    crew: others.flatMap((w) => w.crewIds),
    trip: others.flatMap((w) => w.tripIds),
  };
}

const SCOPE_BY_COLUMN: Readonly<Record<string, Scope>> = {
  user_id: 'user',
  created_by: 'user',
  author_id: 'user',
  owner_id: 'user',
  crew_id: 'crew',
  trip_id: 'trip',
};

/** The table's own id is a scope for the three root tables. */
const ROOT_TABLES: Readonly<Record<string, Scope>> = {
  users: 'user',
  crews: 'crew',
  trips: 'trip',
};

/** Reads every RLS-enabled `public` table with at least one scope column from the catalog. */
export async function loadFuzzTables(pool: pg.Pool): Promise<FuzzTable[]> {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    insertable: boolean;
    updatable: boolean;
  }>(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            (a.attgenerated = '' AND a.attidentity <> 'a') AS insertable,
            has_column_privilege('app_user', c.oid, a.attname, 'UPDATE') AS updatable
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     ORDER BY c.relname, a.attnum`,
  );
  const byTable = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTable.get(row.table_name) ?? [];
    list.push(row);
    byTable.set(row.table_name, list);
  }
  const tables: FuzzTable[] = [];
  for (const [name, columns] of byTable) {
    const scopeColumns: ScopeColumn[] = [];
    for (const col of columns) {
      const scope = SCOPE_BY_COLUMN[col.column_name];
      if (scope !== undefined && col.data_type === 'uuid') {
        scopeColumns.push({ column: col.column_name, scope });
      }
    }
    const root = ROOT_TABLES[name];
    if (root !== undefined) scopeColumns.push({ column: 'id', scope: root });
    if (scopeColumns.length === 0) continue;
    tables.push({
      name,
      scopeColumns,
      insertColumns: columns.filter((c) => c.insertable).map((c) => c.column_name),
      updatableColumn: columns.find((c) => c.updatable)?.column_name,
      hasUuidId: columns.some((c) => c.column_name === 'id' && c.data_type === 'uuid'),
    });
  }
  return tables;
}

/** `(a = ANY($1) OR b = ANY($2) ...)` over the table's scope columns, plus its parameters. */
export function foreignRowFilter(
  table: FuzzTable,
  foreign: Record<Scope, string[]>,
): { sql: string; params: string[][] } {
  const params: string[][] = [];
  const parts = table.scopeColumns.map((sc) => {
    params.push(foreign[sc.scope]);
    return `${quote(sc.column)} = ANY($${params.length}::uuid[])`;
  });
  return { sql: `(${parts.join(' OR ')})`, params };
}

export function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** A device id for the request role; the fuzz never depends on which. */
export function fuzzDevice(): string {
  return anonymousActor().device;
}
