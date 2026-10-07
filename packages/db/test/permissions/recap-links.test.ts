/**
 * `recap_links` (C2, RLS T via the viewer list; `token_hash` C3) and `public.recap_public`: the
 * recap's travellers see that a link exists but never its token hash, nobody else sees it and no
 * client writes it. The public view answers only for a live link of a ready recap, with an
 * allow-list of columns: no money, no ids of people or places, no stays, and first names only of
 * travellers still in the crew who have not hidden themselves.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { addRecapCrewmate } from '../helpers/recap-fixture';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

const LIVE = 'a'.repeat(64);
const REVOKED = 'b'.repeat(64);
const UNKNOWN = 'e'.repeat(64);
const POI = '0199d0b0-0000-7000-8000-000000000001';

let harness: StreamHarness;
let recapId: string;
let homebody: string;

async function asPublicReader<T>(
  recap: string | null,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await harness.db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE public_reader');
    await client.query("SELECT set_config('app.public_recap', $1, true)", [recap ?? '']);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const shown = (recap: string | null) =>
  asPublicReader(
    recap,
    async (tx) =>
      (await tx.query<Record<string, unknown>>('SELECT * FROM public.recap_public')).rows,
  );

const stop = (name: string, category: string | null, poi: string | null = POI) => ({
  ...(poi === null ? {} : { poi_id: poi }),
  name,
  category,
  day_from: 1,
  day_to: 1,
  local_time: '09:30',
  before_sunrise: false,
});

async function named(tx: pg.PoolClient, uid: string, displayName: string): Promise<void> {
  await tx.query('UPDATE users SET display_name = $2 WHERE id = $1', [uid, displayName]);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  const pool = harness.db.pool;
  const travelled = await addRecapCrewmate(pool, harness.fixture, { viewer: true, left: false });
  const left = await addRecapCrewmate(pool, harness.fixture, { viewer: true, left: true });
  const closed = await addRecapCrewmate(pool, harness.fixture, { viewer: true, left: false });
  homebody = await addRecapCrewmate(pool, harness.fixture, { viewer: false, left: false });
  recapId = await withSystem(pool, async (tx) => {
    await named(tx, actors.organiser, '  Mai   Tran ');
    await named(tx, actors.coOrganiser, 'Sam Lee');
    await named(tx, actors.member, 'Dev Rao');
    await named(tx, travelled, 'Ben Okafor');
    await named(tx, left, 'Lia Chen');
    await named(tx, closed, 'Cy Closed');
    await named(tx, homebody, 'Homer Body');
    await tx.query("UPDATE users SET status = 'closed' WHERE id = $1", [closed]);
    // The co-organiser hides their collection from the crew; the member hid their award.
    await tx.query(
      `INSERT INTO user_settings (user_id, hide_collection) VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET hide_collection = true`,
      [actors.coOrganiser],
    );
    await tx.query('UPDATE recap_awards SET opted_out = true WHERE trip_id = $1 AND user_id = $2', [
      tripId,
      actors.member,
    ]);
    const destination = (
      await tx.query<{ id: string }>(
        "INSERT INTO destinations (slug, name) VALUES ('recap-link-ubud', 'Ubud') RETURNING id",
      )
    ).rows[0]!.id;
    await tx.query('UPDATE trips SET destination_id = $2 WHERE id = $1', [tripId, destination]);
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE recaps SET stats = $2, route = $3, receipt = $4, cards = $5 WHERE trip_id = $1
       RETURNING id`,
      [
        tripId,
        JSON.stringify({
          start_date: '2026-10-15',
          end_date: '2026-10-19',
          days: 5,
          travellers: 6,
          distance_m: 184_300,
          distance_estimated: true,
          superlatives: [],
          photos: { count: 212, top_uploader: { user_id: actors.member, count: 90 } },
          critters: { forms_found: 9, new_critters: 4, form_ids: [] },
          best_day: null,
        }),
        JSON.stringify({
          stops: [
            stop('Villa Sukha', 'stay'),
            stop('Tegalalang', 'nature'),
            stop('Ubud Clinic', 'health'),
            stop("Mai's aunt's house", 'other', null),
            stop('Tegalalang', 'nature'),
            stop('Warung Biah Biah', 'food'),
          ],
          legs: [],
          total_m: 184_300,
        }),
        JSON.stringify({ currency: 'USD', total_minor: 412_000, each_minor: 68_667 }),
        JSON.stringify({ cover: { narration: 'Six of you, one volcano.' } }),
      ],
    );
    const id = rows[0]!.id;
    await tx.query(
      `INSERT INTO recap_links (recap_id, trip_id, token_hash, created_by, revoked_at)
       VALUES ($1, $2, $3, $5, NULL), ($1, $2, $4, $5, now())`,
      [id, tripId, LIVE, REVOKED, actors.member],
    );
    return id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('recap_links', () => {
  const READ = 'SELECT id, created_by, revoked_at FROM recap_links WHERE recap_id = $1';

  it('is read by the travellers still in the crew and nobody else', async () => {
    const { actors } = harness.fixture;
    for (const uid of [actors.organiser, actors.coOrganiser, actors.member]) {
      expect(await visibleRows(harness, uid, READ, [recapId])).toBe(2);
    }
    for (const uid of [actors.outsider, actors.exMember, actors.anonymous, homebody]) {
      expect(await visibleRows(harness, uid, READ, [recapId])).toBe(0);
    }
  });

  it('never lets a client read a token hash', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT token_hash FROM recap_links'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is written by the server only', async () => {
    const { actors, tripId } = harness.fixture;
    const attempts = [
      {
        sql: 'INSERT INTO recap_links (recap_id, trip_id, token_hash) VALUES ($1, $2, $3)',
        params: [recapId, tripId, 'f'.repeat(64)],
      },
      { sql: 'UPDATE recap_links SET revoked_at = NULL WHERE recap_id = $1', params: [recapId] },
      { sql: 'DELETE FROM recap_links WHERE recap_id = $1', params: [recapId] },
    ];
    for (const uid of [actors.organiser, actors.member]) {
      for (const attempt of attempts) {
        await expect(
          withUser(harness.db.pool, uid, randomUUID(), (tx) =>
            tx.query(attempt.sql, attempt.params),
          ),
          attempt.sql,
        ).rejects.toThrow(/permission denied/i);
      }
    }
  });
});

describe('public.recap_public', () => {
  it('shows a ready recap for its live link, cut to the public-safe slice', async () => {
    expect(await shown(LIVE)).toEqual([
      {
        recap_id: recapId,
        destination_name: 'Ubud',
        travel_month: 10,
        travel_year: 2026,
        days: 5,
        travellers: 6,
        // Hidden: a hidden collection, a hidden award, a member who left, a closed account and a
        // crewmate who never travelled.
        crew_names: ['Ben', 'Mai'],
        distance_m: 184_300,
        distance_estimated: true,
        // Hidden: the stay, the clinic and the place the crew typed in itself; a repeat counts once.
        places_count: 2,
        places: [
          { name: 'Tegalalang', category: 'nature' },
          { name: 'Warung Biah Biah', category: 'food' },
        ],
        critters_found: 9,
        new_critters: 4,
      },
    ]);
  });

  it('shows nothing for a revoked or unknown link, or with no link set', async () => {
    for (const recap of [REVOKED, UNKNOWN, null]) expect(await shown(recap)).toEqual([]);
  });

  it('shows nothing while the recap is not ready', async () => {
    const setStatus = (status: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query('UPDATE recaps SET status = $2 WHERE id = $1', [recapId, status]),
      );
    await setStatus('building');
    try {
      expect(await shown(LIVE)).toEqual([]);
    } finally {
      await setStatus('ready');
    }
  });

  it('stops showing once the link is revoked', async () => {
    const setRevoked = (value: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(`UPDATE recap_links SET revoked_at = ${value} WHERE token_hash = $1`, [LIVE]),
      );
    await setRevoked('now()');
    try {
      expect(await shown(LIVE)).toEqual([]);
    } finally {
      await setRevoked('NULL');
    }
  });

  it('survives a recap whose aggregates are missing or malformed', async () => {
    const saved = await withSystem(harness.db.pool, async (tx) => {
      const { rows } = await tx.query<{ stats: unknown; route: unknown }>(
        'SELECT stats, route FROM recaps WHERE id = $1',
        [recapId],
      );
      await tx.query(
        `UPDATE recaps SET stats = '{"start_date":"soon","days":"five"}', route = '{"stops":7}'
          WHERE id = $1`,
        [recapId],
      );
      return rows[0]!;
    });
    try {
      const [row] = await shown(LIVE);
      expect(row).toMatchObject({
        travel_month: null,
        travel_year: null,
        days: null,
        distance_m: null,
        distance_estimated: false,
        places_count: 0,
        places: [],
      });
    } finally {
      await withSystem(harness.db.pool, (tx) =>
        tx.query('UPDATE recaps SET stats = $2, route = $3 WHERE id = $1', [
          recapId,
          JSON.stringify(saved.stats),
          JSON.stringify(saved.route),
        ]),
      );
    }
  });

  it('carries only its allow-listed columns', async () => {
    const { rows } = await harness.db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'recap_public'
        ORDER BY ordinal_position`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'recap_id',
      'destination_name',
      'travel_month',
      'travel_year',
      'days',
      'travellers',
      'crew_names',
      'distance_m',
      'distance_estimated',
      'places_count',
      'places',
      'critters_found',
      'new_critters',
    ]);
  });

  it('gives public_reader the view and none of the tables behind it', async () => {
    for (const table of ['recap_links', 'recaps', 'recap_views', 'recap_awards', 'users']) {
      await expect(
        asPublicReader(LIVE, (tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });
});
