/**
 * A standalone solo trip to Kyoto guided by Pon: a solo trip skips voting entirely and starts
 * straight in `setup` (docs/data-model-sync-and-privacy.md §3.1). No screens name a solo persona,
 * so "Sana" is an invented, realistic one-off traveller distinct from the Bali Six roster — flagged
 * here rather than left unexplained.
 */
import type pg from 'pg';

import { withSystem } from '../src/tx';

const CREW_NAME = "Sana's solo trip";

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined)
    throw new Error('seed: expected at least one row back from an INSERT ... RETURNING');
  return row;
}

/** Idempotent: does nothing if this solo traveller's crew already exists. */
export async function seedTripKyotoSolo(pool: pg.Pool): Promise<void> {
  const existing = await pool.query('SELECT 1 FROM crews WHERE name = $1', [CREW_NAME]);
  if ((existing.rowCount ?? 0) > 0) {
    console.log(`seed: "${CREW_NAME}" already exists, skipping`);
    return;
  }

  await withSystem(pool, async (tx) => {
    const userId = firstRow(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO users (id, status, display_name, username, home_airport, home_country, locale, tz)
           VALUES (uuidv7(), 'registered', 'Sana', 'sana', 'HND', 'Japan', 'en', 'Asia/Tokyo')
           RETURNING id`,
        )
      ).rows,
    ).id;

    const crewId = firstRow(
      (
        await tx.query<{ id: string }>(
          'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
          [CREW_NAME, userId],
        )
      ).rows,
    ).id;
    await tx.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      userId,
      'organiser',
    ]);

    const destinationId = firstRow(
      (await tx.query<{ id: string }>("SELECT id FROM destinations WHERE slug = 'kyoto'")).rows,
    ).id;
    const guideId = firstRow(
      (await tx.query<{ id: string }>("SELECT id FROM guides WHERE slug = 'pon'")).rows,
    ).id;

    const tripId = firstRow(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO trips (crew_id, status, destination_id, guide_id, is_solo, start_date, end_date, tz, local_currency, seat_cap)
           VALUES ($1, 'setup', $2, $3, true, '2026-11-03', '2026-11-08', 'Asia/Tokyo', 'JPY', 1)
           RETURNING id`,
          [crewId, destinationId, guideId],
        )
      ).rows,
    ).id;

    await tx.query(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [tripId, userId, 'organiser', 'in'],
    );
  });

  console.log(`seed: created "${CREW_NAME}" (solo Kyoto trip, Pon guiding)`);
}
