/**
 * The swipe deck against a migrated Postgres: places already in the plan never appear, the stay's
 * neighbour and the crew's saved place rank up, the guide's notes attach by card while the model
 * sees only short card ids and our own place data (no database ids), a rejected note leaves its
 * card bare, the session goes live once, and a rebuild of a live session does nothing.
 */
import { createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSwipeDeck } from '../../src/jobs/ai/swipe-deck';
import { fakeModel } from '../guide/guide-fixtures';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let sessionId: string;
const ids: Record<string, string> = {};

async function poi(
  destinationId: string,
  name: string,
  category: string,
  lat: number,
  tags = '{}',
) {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, tags, editorial)
     VALUES ($1, $2, $3, $4, 135.77, 'editorial', $5, '{}') RETURNING id`,
    [destinationId, name, category, lat, tags],
  );
  ids[name] = rows[0]!.id;
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await startNotifyDb();
  const [a, b] = [await insertUser(db.pool), await insertUser(db.pool)];
  const crewId = await insertCrew(db.pool, [a, b]);
  const { rows: dest } = await db.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('deck-kyoto', 'Kyoto', 'live') RETURNING id",
  );
  const destinationId = dest[0]!.id;
  const stay = await poi(destinationId, 'Gion Ryokan', 'stay', 35.003);
  const planned = await poi(destinationId, 'Kiyomizu-dera', 'temple_shrine', 34.995);
  await poi(destinationId, 'Far Temple', 'temple_shrine', 35.3);
  await poi(destinationId, 'Near Market', 'market', 35.004);
  const saved = await poi(destinationId, 'Saved Garden', 'nature', 35.2);
  const { rows: trip } = await db.pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, tz) VALUES ($1, 'setup', $2, 'Asia/Tokyo')
     RETURNING id`,
    [crewId, destinationId],
  );
  const tripId = trip[0]!.id;
  for (const [uid, role] of [
    [a, 'organiser'],
    [b, 'member'],
  ] as const) {
    await db.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, role],
    );
  }
  const { rows: version } = await db.pool.query<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  const { rows: day } = await db.pool.query<{ id: string }>(
    "INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-11-02') RETURNING id",
    [version[0]!.id, tripId],
  );
  for (const placeId of [stay, planned]) {
    await db.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, poi_id, category)
       VALUES ($1, $2, $3, gen_random_uuid(), $4, 'visit')`,
      [version[0]!.id, day[0]!.id, tripId, placeId],
    );
  }
  await db.pool.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
    version[0]!.id,
    tripId,
  ]);
  await db.pool.query("INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'poi', $2)", [
    b,
    saved,
  ]);
  const { rows: session } = await db.pool.query<{ id: string }>(
    `INSERT INTO swipe_sessions (trip_id, destination_id, started_by, match_rule)
     VALUES ($1, $2, $3, 2) RETURNING id`,
    [tripId, destinationId, a],
  );
  sessionId = session[0]!.id;
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('ai.swipe_deck', () => {
  it('ranks the curated places not yet in the plan and attaches the guide notes by card', async () => {
    const model = fakeModel(() =>
      JSON.stringify({
        notes: [
          { id: 'c1', note: 'Two minutes from your ryokan, grab snacks here.' },
          { id: 'c2', note: 'Go at https://example.com' },
          { id: 'c9', note: 'Unknown card.' },
        ],
      }),
    );
    const result = await buildSwipeDeck(db.pool, { session_id: sessionId }, () =>
      createGateway({ apiKey: 'test', fetch: model.fetch, maxAttempts: 1 }),
    );
    expect(result).toEqual({ outcome: 'live', cards: 3 });
    const sent = JSON.stringify(model.requests[0]?.['messages']);
    for (const id of Object.values(ids)) expect(sent).not.toContain(id);
    expect(sent).toContain('Saved Garden');

    const { rows } = await db.pool.query<{
      status: string;
      deck: { poi_id: string; note: string | null }[];
    }>('SELECT status, deck FROM swipe_sessions WHERE id = $1', [sessionId]);
    expect(rows[0]?.status).toBe('live');
    const deck = rows[0]!.deck;
    expect(deck.map((card) => card.poi_id)).toEqual([
      ids['Near Market'],
      ids['Saved Garden'],
      ids['Far Temple'],
    ]);
    expect(deck.map((card) => card.note)).toEqual([
      'Two minutes from your ryokan, grab snacks here.',
      null,
      null,
    ]);
  });

  it('leaves a live session alone', async () => {
    const model = fakeModel(() => '{}');
    const result = await buildSwipeDeck(db.pool, { session_id: sessionId }, () =>
      createGateway({ apiKey: 'test', fetch: model.fetch, maxAttempts: 1 }),
    );
    expect(result.outcome).toBe('not_building');
    expect(model.requests).toHaveLength(0);
  });
});
