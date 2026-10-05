/**
 * Rows that name a merged place follow it to the kept one. A places release merges duplicate or
 * wrongly pinned records into the record at the real place (`pois.merged_into_id`); readers hide
 * merged records, but a trip's stop, a must-do, an idea, a save, a swipe answer or a hidden place
 * keeps the id it has, and with it the old pin. Here every such row is moved to the kept record
 * (through a chain of merges), and where the kept record is already on the same day or
 * list, one is kept:
 *
 * - Plans: every version's stops follow, whatever the trip's state, and nothing about their times
 *   changes. On a trip that has not started, a day of a live version that would hold the place
 *   twice keeps one stop (a booked or locked one first, then the one already there, then the
 *   earliest) and hands it the other's must-do. The version's own record of its places gains the
 *   kept one, the stored legs of the stops that moved are dropped, and the trip's legs and check
 *   are queued through the same sends a plan edit uses.
 * - Ideas: one idea per place and trip; the kept one takes the other's backers and sources.
 * - Must-dos: one per place, trip and owner.
 * - Lists with one row per person or trip and place (saves, hidden places, stances, swipe answers,
 *   matches, crew notes) keep one; history rows (visits, meetups, ride quotes, vendor threads, expenses, encounters)
 *   are simply moved.
 *
 * Runs as the system inside the caller's transaction, each table under its own savepoint so one
 * table that cannot be moved never undoes a publish. Running it again moves nothing.
 */
import type pg from 'pg';

import { followPlans, keptOf, type Change } from './follow-merges-plans';

interface Follower {
  readonly table: string;
  readonly column: string;
  /** Columns that, with the place, allow one row only; null = no such rule. */
  readonly key: readonly string[] | null;
  readonly trip: boolean;
  readonly where?: string;
  /**
   * False where the system may not delete (a derived row per trip and place): a row whose kept
   * place already has one is left where it is.
   */
  readonly drop?: boolean;
}

const FOLLOWERS: readonly Follower[] = [
  {
    table: 'saved_items',
    column: 'ref_id',
    key: ['user_id', 'kind'],
    trip: false,
    where: "t.kind = 'place'",
  },
  { table: 'place_hides', column: 'poi_id', key: ['user_id'], trip: false },
  { table: 'place_stances', column: 'poi_id', key: ['trip_id', 'user_id'], trip: true },
  { table: 'swipe_votes', column: 'poi_id', key: ['session_id', 'user_id'], trip: true },
  { table: 'swipe_yes_votes', column: 'poi_id', key: ['session_id', 'user_id'], trip: true },
  { table: 'swipe_matches', column: 'poi_id', key: ['session_id'], trip: true, drop: false },
  { table: 'place_qna_summaries', column: 'poi_id', key: ['trip_id'], trip: true, drop: false },
  { table: 'place_tips', column: 'poi_id', key: null, trip: false },
  { table: 'visits', column: 'poi_id', key: null, trip: true },
  { table: 'meetups', column: 'poi_id', key: null, trip: true },
  { table: 'ops.vendor_threads', column: 'poi_id', key: null, trip: true },
  { table: 'ride_quotes', column: 'from_poi_id', key: null, trip: true },
  { table: 'ride_quotes', column: 'to_poi_id', key: null, trip: true },
  { table: 'expenses', column: 'poi_id', key: null, trip: true },
  { table: 'encounters', column: 'poi_id', key: null, trip: true },
  { table: 'collection_entries', column: 'poi_id', key: null, trip: true },
];

export interface TableCount {
  readonly moved: number;
  /** Rows not kept because the kept place was already there. */
  readonly dropped: number;
}

export interface FollowResult {
  readonly tables: Readonly<Record<string, TableCount>>;
  /** Rows changed per trip, for the tables that belong to a trip. */
  readonly trips: Readonly<Record<string, number>>;
  /** Trips whose live plan changed: their legs and check were queued. */
  readonly replanned: readonly string[];
  /** Tables that could not be moved, with the reason. */
  readonly failed: Readonly<Record<string, string>>;
}

function followerSql(follower: Follower): string {
  const { table, column, key } = follower;
  const trip = follower.trip ? 't.trip_id' : 'NULL::uuid';
  const where = follower.where === undefined ? '' : `WHERE ${follower.where}`;
  if (key === null) {
    return `WITH moving AS (
        SELECT t.id, m.kept FROM ${table} t JOIN ${keptOf(`t.${column}`)} ON true
      ), followed AS (
        UPDATE ${table} t SET ${column} = moving.kept FROM moving WHERE t.id = moving.id
        RETURNING ${trip} AS trip_id
      ) SELECT 'moved' AS what, trip_id FROM followed`;
  }
  const same = key.map((col) => `o.${col} IS NOT DISTINCT FROM t.${col}`).join(' AND ');
  const moving = `moving AS (
      SELECT t.id, m.kept, ${trip} AS trip_id,
             (row_number() OVER (PARTITION BY ${key.map((col) => `t.${col}`).join(', ')}, m.kept
                                 ORDER BY t.id) > 1
              OR EXISTS (SELECT 1 FROM ${table} o
                          WHERE o.${column} = m.kept AND o.id <> t.id AND ${same})) AS taken
        FROM ${table} t JOIN ${keptOf(`t.${column}`)} ON true ${where}
    )`;
  const followed = `followed AS (
      UPDATE ${table} t SET ${column} = m.kept FROM moving m
       WHERE t.id = m.id AND NOT m.taken
      RETURNING t.id
    )`;
  if (follower.drop === false) {
    return `WITH ${moving}, ${followed}
      SELECT 'moved' AS what, m.trip_id FROM followed f JOIN moving m ON m.id = f.id`;
  }
  return `WITH ${moving}, gone AS (
      DELETE FROM ${table} t USING moving m WHERE t.id = m.id AND m.taken
      RETURNING t.id
    ), ${followed}
    SELECT 'moved' AS what, m.trip_id FROM followed f JOIN moving m ON m.id = f.id
    UNION ALL
    SELECT 'dropped', m.trip_id FROM gone g JOIN moving m ON m.id = g.id`;
}

/** Ideas: one live idea per trip and place; the kept one takes the others' backers and sources. */
async function followIdeas(tx: pg.PoolClient): Promise<Change[]> {
  const { rows } = await tx.query<Change>(
    `WITH placed AS (
       SELECT i.id, i.trip_id, coalesce(m.kept, i.poi_id) AS place, (m.kept IS NOT NULL) AS follows,
              i.backer_ids, i.sources, i.created_at
         FROM trip_ideas i LEFT JOIN ${keptOf('i.poi_id')} ON true
        WHERE i.poi_id IS NOT NULL AND i.deleted_at IS NULL
     ), ranked AS (
       SELECT p.*, bool_or(p.follows) OVER (PARTITION BY p.trip_id, p.place) AS touched,
              row_number() OVER (PARTITION BY p.trip_id, p.place
                                 ORDER BY p.follows, p.created_at, p.id) AS n
         FROM placed p
     ), folded AS (
       UPDATE trip_ideas i SET deleted_at = now()
         FROM ranked r WHERE r.id = i.id AND r.touched AND r.n > 1
       RETURNING i.id, r.trip_id
     ), kept AS (
       UPDATE trip_ideas i
          SET poi_id = r.place,
              name = CASE WHEN r.follows THEN p.name ELSE i.name END,
              category = CASE WHEN r.follows THEN p.category ELSE i.category END,
              lat = CASE WHEN r.follows THEN p.lat ELSE i.lat END,
              lng = CASE WHEN r.follows THEN p.lng ELSE i.lng END,
              backer_ids = coalesce(
                (SELECT array_agg(DISTINCT b) FROM ranked o, unnest(o.backer_ids) AS b
                  WHERE o.trip_id = r.trip_id AND o.place = r.place), '{}'::uuid[]),
              sources = coalesce(
                (SELECT array_agg(DISTINCT s) FROM ranked o, unnest(o.sources) AS s
                  WHERE o.trip_id = r.trip_id AND o.place = r.place), i.sources)
         FROM ranked r JOIN pois p ON p.id = r.place
        WHERE r.id = i.id AND r.touched AND r.n = 1
          AND (r.follows OR EXISTS (SELECT 1 FROM folded f WHERE f.trip_id = r.trip_id))
       RETURNING i.id, r.trip_id, r.follows
     )
     SELECT 'moved' AS what, trip_id FROM kept WHERE follows
     UNION ALL SELECT 'dropped', trip_id FROM folded`,
  );
  // Ideas no longer live (taken back, or folded just now) follow too; no rule binds them.
  await tx.query(
    `WITH moving AS (
       SELECT i.id, m.kept FROM trip_ideas i JOIN ${keptOf('i.poi_id')} ON true
        WHERE i.deleted_at IS NOT NULL
     )
     UPDATE trip_ideas i SET poi_id = moving.kept FROM moving WHERE i.id = moving.id`,
  );
  return rows;
}

/** Must-dos follow; one owner's two must-dos for what is now one place become one. */
async function followMustDos(tx: pg.PoolClient): Promise<Change[]> {
  const { rows } = await tx.query<{ id: string; trip_id: string }>(
    `WITH moving AS (
       SELECT d.id, m.kept FROM must_dos d JOIN ${keptOf('d.poi_id')} ON true
     )
     UPDATE must_dos d SET poi_id = moving.kept FROM moving WHERE d.id = moving.id
     RETURNING d.id, d.trip_id`,
  );
  const { rows: folded } = await tx.query<{ trip_id: string }>(
    `WITH ranked AS (
       SELECT d.id, d.trip_id, bool_or(d.id = ANY($1::uuid[])) OVER w AS touched,
              row_number() OVER (w ORDER BY d.priority, d.created_at, d.id) AS n
         FROM must_dos d WHERE d.poi_id IS NOT NULL AND d.deleted_at IS NULL
       WINDOW w AS (PARTITION BY d.trip_id, d.owner_id, d.poi_id)
     )
     UPDATE must_dos d SET deleted_at = now() FROM ranked r
      WHERE r.id = d.id AND r.touched AND r.n > 1
     RETURNING d.trip_id`,
    [rows.map((row) => row.id)],
  );
  return [
    ...rows.map((row) => ({ what: 'moved' as const, trip_id: row.trip_id })),
    ...folded.map((row) => ({ what: 'dropped' as const, trip_id: row.trip_id })),
  ];
}

export async function followMergedPlaces(tx: pg.PoolClient): Promise<FollowResult> {
  const tables: Record<string, TableCount> = {};
  const trips: Record<string, number> = {};
  const failed: Record<string, string> = {};
  let replanned: string[] = [];
  const count = (name: string, changes: readonly Change[]) => {
    const before = tables[name] ?? { moved: 0, dropped: 0 };
    tables[name] = {
      moved: before.moved + changes.filter((change) => change.what === 'moved').length,
      dropped: before.dropped + changes.filter((change) => change.what === 'dropped').length,
    };
    for (const change of changes) {
      if (change.trip_id !== null) trips[change.trip_id] = (trips[change.trip_id] ?? 0) + 1;
    }
  };
  const guarded = async (name: string, run: () => Promise<readonly Change[]>) => {
    await tx.query('SAVEPOINT follow_merges');
    try {
      count(name, await run());
      await tx.query('RELEASE SAVEPOINT follow_merges');
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT follow_merges');
      failed[name] = error instanceof Error ? error.message : String(error);
    }
  };
  await guarded('plan_items', async () => {
    const plans = await followPlans(tx);
    replanned = plans.replanned;
    return plans.changes;
  });
  await guarded('must_dos', () => followMustDos(tx));
  await guarded('trip_ideas', () => followIdeas(tx));
  for (const follower of FOLLOWERS) {
    await guarded(follower.table, async () => (await tx.query<Change>(followerSql(follower))).rows);
  }
  return { tables, trips, replanned: 'plan_items' in failed ? [] : replanned, failed };
}
