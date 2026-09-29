/**
 * The draft eval's kyoto-3 crew as database rows, and its live DeepSeek recording replayed by call
 * at the network boundary: what the drafting job suites run on.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createGateway, type DraftModel } from '@cp/ai';
import type pg from 'pg';

export interface Recording {
  readonly city: {
    readonly tz: string;
    readonly pois: {
      id: string;
      name: string;
      category: string;
      lat: number;
      lng: number;
      hours: unknown;
      price_level: number | null;
      duration_min: number;
      tags: string[];
      must_see: boolean;
    }[];
  };
  readonly crew: {
    readonly start: string;
    readonly days: number;
    readonly members: { name: string; tastes: string[]; chronotype: string | null }[];
    readonly diets: string[];
    readonly must_dos: { poi_id: string; owner: number }[];
  };
  readonly calls: Record<string, { status: number; body: unknown }>;
}

export const RECORDING = JSON.parse(
  readFileSync(new URL('../../../fixtures/draft/kyoto-draft.json', import.meta.url), 'utf8'),
) as Recording;

export const replay: DraftModel = {
  call: (route, input, key) =>
    createGateway({
      apiKey: 'fixture-key',
      maxAttempts: 1,
      fetch: () => {
        const call = RECORDING.calls[key];
        if (call === undefined) throw new Error(`no recorded call ${key}`);
        return Promise.resolve(
          new Response(JSON.stringify(call.body), {
            status: call.status,
            headers: { 'content-type': 'application/json' },
          }),
        );
      },
    }).callModel(route, input),
};

async function id(pool: pg.Pool, sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  return rows[0]?.id as string;
}

/** The recording's crew and places, seeded as the migration owner. */
export async function seedTrip(pool: pg.Pool) {
  const { crew, city } = RECORDING;
  const uids = crew.members.map(() => randomUUID());
  for (const [i, uid] of uids.entries()) {
    await pool.query("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      `${crew.members[i]?.name ?? 'Member'} Test`,
    ]);
  }
  const organiser = uids[0] as string;
  const crewId = await id(
    pool,
    "INSERT INTO crews (name, created_by) VALUES ('Kyoto crew', $1) RETURNING id",
    [organiser],
  );
  const destinationId = await id(
    pool,
    "INSERT INTO destinations (slug, name, country, tz, currency) VALUES ('kyoto', 'Kyoto', 'Japan', $1, 'JPY') RETURNING id",
    [city.tz],
  );
  const guideId = await id(
    pool,
    "INSERT INTO guides (slug, name, colour) VALUES ('pon', 'Pon', 'green') RETURNING id",
    [],
  );
  const end = new Date(Date.parse(`${crew.start}T00:00:00Z`) + (crew.days - 1) * 86_400_000);
  const tripId = await id(
    pool,
    `INSERT INTO trips (crew_id, status, guide_id, destination_id, start_date, end_date, tz)
     VALUES ($1, 'setup', $2, $3, $4, $5, $6) RETURNING id`,
    [crewId, guideId, destinationId, crew.start, end.toISOString().slice(0, 10), city.tz],
  );
  for (const [i, uid] of uids.entries()) {
    const member = crew.members[i];
    await pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      i === 0 ? 'organiser' : 'member',
    ]);
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, i === 0 ? 'organiser' : 'member'],
    );
    const chronotype =
      member?.chronotype === 'early_bird'
        ? ['early_starts']
        : member?.chronotype === 'night_owl'
          ? ['late_starts']
          : [];
    await pool.query(
      "INSERT INTO taste_profiles (user_id, tags, visibility) VALUES ($1, $2, 'crew')",
      [uid, [...(member?.tastes ?? []), ...chronotype]],
    );
  }
  await pool.query(
    'INSERT INTO participant_dietary_flags (trip_id, user_id, flags) VALUES ($1, $2, $3)',
    [tripId, uids[1], crew.diets],
  );
  for (const poi of city.pois) {
    await pool.query(
      `INSERT INTO pois (id, destination_id, name, category, lat, lng, hours, price_level, tags, editorial,
         curation, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'editorial', $11)`,
      [
        poi.id,
        destinationId,
        poi.name,
        poi.category,
        poi.lat,
        poi.lng,
        JSON.stringify(poi.hours ?? { weekly: {} }),
        poi.price_level === 0 ? null : poi.price_level,
        poi.price_level === 0 ? [...poi.tags, 'free'] : poi.tags,
        JSON.stringify({ time_needed_min: poi.duration_min, must_see: poi.must_see }),
        city.tz,
      ],
    );
  }
  await pool.query(
    `INSERT INTO destination_cost_indices (destination_id, stay_type, nightly_minor_low, nightly_minor_high,
       food_pp_day_minor, fun_pp_day_minor, currency, source, sourced_on, reviewed_at)
     VALUES ($1, 'apartment', 9000, 12000, 5500, 4000, 'USD', 'editorial', current_date, now())`,
    [destinationId],
  );
  for (const mustDo of crew.must_dos) {
    const poi = city.pois.find((p) => p.id === mustDo.poi_id);
    await pool.query(
      'INSERT INTO must_dos (trip_id, owner_id, title, poi_id) VALUES ($1, $2, $3, $4)',
      [tripId, uids[mustDo.owner], poi?.name ?? 'Must-do', mustDo.poi_id],
    );
  }
  await pool.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [tripId]);
  return { tripId, organiser };
}
