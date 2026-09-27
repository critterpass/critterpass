/**
 * Winston's crew "The Bali Six" and its confirmed Bali trip (Oct 12-19, Tokek guiding), transcribed
 * from the designed screens (docs/design-renders/screens.json labels 3c-9/"who's in") rather than
 * invented: Winston (organiser), Maya, Jordan and Alex are already "in"; Rin and Dev have not yet
 * opened their invite. A plan version with two days gives the plan tables something real to hold.
 */
import type pg from 'pg';

import { withSystem } from '../src/tx';

const CREW_NAME = 'The Bali Six';

interface SeedMember {
  readonly username: string;
  readonly displayName: string;
  readonly role: 'organiser' | 'member';
  readonly rsvp: string;
}

const MEMBERS: readonly SeedMember[] = [
  { username: 'winston', displayName: 'Winston', role: 'organiser', rsvp: 'in' },
  { username: 'maya', displayName: 'Maya', role: 'member', rsvp: 'in' },
  { username: 'jordan', displayName: 'Jordan', role: 'member', rsvp: 'in' },
  { username: 'alex', displayName: 'Alex', role: 'member', rsvp: 'in' },
  { username: 'rin', displayName: 'Rin', role: 'member', rsvp: 'unopened' },
  { username: 'dev', displayName: 'Dev', role: 'member', rsvp: 'unopened' },
];

function firstRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  if (row === undefined)
    throw new Error('seed: expected at least one row back from an INSERT ... RETURNING');
  return row;
}

/** Idempotent: does nothing if a crew with this name already exists. */
export async function seedCrewBaliSix(pool: pg.Pool): Promise<void> {
  const existing = await pool.query('SELECT 1 FROM crews WHERE name = $1', [CREW_NAME]);
  if ((existing.rowCount ?? 0) > 0) {
    console.log(`seed: "${CREW_NAME}" already exists, skipping`);
    return;
  }

  await withSystem(pool, async (tx) => {
    const userIds = new Map<string, string>();
    for (const member of MEMBERS) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO users (id, status, display_name, username, home_airport, home_country, locale, tz)
         VALUES (uuidv7(), 'registered', $1, $2, 'SIN', 'Singapore', 'en', 'Asia/Singapore') RETURNING id`,
        [member.displayName, member.username],
      );
      userIds.set(member.username, firstRow(rows).id);
    }
    const uidOf = (username: string): string => {
      const id = userIds.get(username);
      if (id === undefined) throw new Error(`seed: no user id captured for ${username}`);
      return id;
    };

    const crewId = firstRow(
      (
        await tx.query<{ id: string }>(
          'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
          [CREW_NAME, uidOf('winston')],
        )
      ).rows,
    ).id;

    for (const member of MEMBERS) {
      await tx.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
        crewId,
        uidOf(member.username),
        member.role,
      ]);
    }

    const destinationId = firstRow(
      (await tx.query<{ id: string }>("SELECT id FROM destinations WHERE slug = 'bali'")).rows,
    ).id;
    const guideId = firstRow(
      (await tx.query<{ id: string }>("SELECT id FROM guides WHERE slug = 'tokek'")).rows,
    ).id;

    const tripId = firstRow(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO trips (crew_id, status, destination_id, guide_id, start_date, end_date, tz, local_currency, seat_cap)
           VALUES ($1, 'voting', $2, $3, '2026-10-12', '2026-10-19', 'Asia/Makassar', 'IDR', 6)
           RETURNING id`,
          [crewId, destinationId, guideId],
        )
      ).rows,
    ).id;
    // The trip status guard only accepts one hop per UPDATE (packages/db/src/state/trip.ts); walk
    // the crew straight to "confirmed" (voted, planned, everyone booked in) for a realistic seed.
    for (const status of ['won', 'setup', 'drafting', 'draft_review', 'proposed', 'confirmed']) {
      await tx.query('UPDATE trips SET status = $1 WHERE id = $2', [status, tripId]);
    }

    for (const member of MEMBERS) {
      await tx.query(
        'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
        [tripId, uidOf(member.username), member.role, member.rsvp],
      );
    }

    const versionId = firstRow(
      (
        await tx.query<{ id: string }>(
          "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
          [tripId],
        )
      ).rows,
    ).id;

    const day1Id = firstRow(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, 1, '2026-10-12', 'Arrival and the villa pool') RETURNING id`,
          [versionId, tripId],
        )
      ).rows,
    ).id;
    const day2Id = firstRow(
      (
        await tx.query<{ id: string }>(
          `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme) VALUES ($1, $2, 2, '2026-10-13', 'Uluwatu at sunset') RETURNING id`,
          [versionId, tripId],
        )
      ).rows,
    ).id;

    await tx.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, is_outdoor, notes)
       VALUES ($1, $2, $3, '2026-10-12T15:00:00+08:00', 'Asia/Makassar', 'lodging', false, 'Check in at the villa, pool before dinner')`,
      [versionId, day1Id, tripId],
    );
    await tx.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, is_outdoor, notes)
       VALUES ($1, $2, $3, '2026-10-13T17:30:00+08:00', 'Asia/Makassar', 'sightseeing', true, 'Uluwatu cliff temple at sunset, volcano views on the drive up')`,
      [versionId, day2Id, tripId],
    );

    await tx.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [versionId, tripId]);
  });

  console.log(`seed: created "${CREW_NAME}" with a confirmed Bali trip (Oct 12-19, Tokek guiding)`);
}
