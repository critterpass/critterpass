/**
 * `GET /v1/public/proposal/{token}` against the real stack: a live trip code or open seat answers
 * the sent draft's first days, uncached; a code switched off after a first view answers 404 on the
 * next request, as does any code that never pointed at a trip.
 */
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPublicPreviewRoutes } from '../../src/routes/public-previews';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

// A seat token in its real shape (44 url-safe characters, then the key id).
const SEAT = `${'s'.repeat(44)}k1`;

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerPublicPreviewRoutes(app, deps),
  );
  const one = async (sql: string, params: unknown[] = []) =>
    (await harness.pool.query<{ id: string }>(sql, params)).rows[0]!.id;
  const organiser = await one(
    "INSERT INTO users (id, status, display_name) VALUES (uuidv7(), 'registered', 'Winston Lee') RETURNING id",
  );
  const crew = await one(
    "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
    [organiser],
  );
  const trip = await one(
    "INSERT INTO trips (crew_id, status, start_date, end_date) VALUES ($1, 'voting', '2026-10-12', '2026-10-19') RETURNING id",
    [crew],
  );
  const version = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [trip],
  );
  for (const [dayNo, theme] of [
    [1, 'Villa, pool, nothing else'],
    [2, 'Batur sunrise hike'],
    [3, 'Boat day to Penida'],
    [4, 'Ubud rice terraces'],
  ] as const) {
    await harness.pool.query(
      "INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, $3, '2026-10-12'::date + $3::int - 1, $4)",
      [version, trip, dayNo, theme],
    );
  }
  await harness.pool.query(
    `INSERT INTO proposals (trip_id, created_by, reply_by, status, sent_at, version_id)
     VALUES ($1, $2, now() + interval '7 days', 'sent', now(), $3)`,
    [trip, organiser, version],
  );
  for (const code of ['BXP6XA', 'BXP6XB']) {
    await harness.pool.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
       VALUES ($1, 'trip', $2, $3, $4)`,
      [code, trip, crew, organiser],
    );
  }
  await harness.pool.query(
    `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
     VALUES ('BXP6XC', 'crew', $1, $1, $2)`,
    [crew, organiser],
  );
  await harness.pool.query(
    `INSERT INTO invites (crew_id, trip_id, inviter_id, kind, seat_token_hash, status, expires_at)
     VALUES ($1, $2, $3, 'personal', $4, 'pending', now() + interval '14 days')`,
    [crew, trip, organiser, createHash('sha256').update(SEAT).digest('hex')],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const get = (path: string) => harness.request(path, { headers: { 'x-real-ip': '198.51.100.7' } });

describe('GET /v1/public/proposal/{token}', () => {
  it('answers the first three days of the sent draft for a live trip code, uncached', async () => {
    const response = await get('/v1/public/proposal/bxp-6xa');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      kind: 'proposal',
      days_total: 4,
      days: [
        { day_no: 1, date: '2026-10-12', theme: 'Villa, pool, nothing else', stops: [] },
        { day_no: 2, date: '2026-10-13', theme: 'Batur sunrise hike', stops: [] },
        { day_no: 3, date: '2026-10-14', theme: 'Boat day to Penida', stops: [] },
      ],
    });
  });

  it('answers an open personal seat by its token', async () => {
    const response = await get(`/v1/public/proposal/BXP6XA?seat=${SEAT}`);
    expect(response.status).toBe(200);
  });

  it('answers 404 once the code is switched off', async () => {
    expect((await get('/v1/public/proposal/BXP6XB')).status).toBe(200);
    await harness.pool.query("UPDATE join_codes SET status = 'revoked' WHERE code = 'BXP6XB'");
    expect((await get('/v1/public/proposal/BXP6XB')).status).toBe(404);
  });

  it('answers 404 for a crew code, an unknown code and a malformed one', async () => {
    for (const token of ['BXP6XC', 'ZZZZ2K', 'not-a-code']) {
      expect((await get(`/v1/public/proposal/${token}`)).status).toBe(404);
    }
  });

  it('rejects a kind it does not serve', async () => {
    expect((await get('/v1/public/payroll/BXP6XA')).status).not.toBe(200);
  });
});
