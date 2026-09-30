/**
 * Seeds the Bali Six's week into the local database as sync writes it: the crew, the trip (with
 * my role), its current version's days and items, their places and bookings, open votes and the
 * forecast. `me` is bound as the database owner.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are fixtures and SQL. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { TestLocalFirst } from '@/data/powersync/test-support/local-first-fixture';

import {
  BALI_CREW,
  BALI_DAYS,
  BALI_DESTINATION,
  BALI_ITEMS,
  BALI_MEMBERS,
  BALI_POLLS,
  BALI_TRIP,
  BALI_TZ,
  BALI_VERSION,
  BALI_WEATHER,
} from '../dev/bali-plan';

export async function seedBaliPlan(
  db: TestLocalFirst['db'],
  me: string,
  options: { role?: 'organiser' | 'member'; phase?: string; withPlan?: boolean } = {},
): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    me,
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [BALI_CREW, 'The Bali Six']);
  for (const [index, member] of BALI_MEMBERS.entries()) {
    await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [
      member.user_id,
      member.display_name,
    ]);
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${index}`, BALI_CREW, member.user_id, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute(
    `INSERT INTO destinations (id, slug, name, coverage, tz) VALUES (?, 'bali', 'Bali', 'live', ?)`,
    [BALI_DESTINATION, BALI_TZ],
  );
  const withPlan = options.withPlan ?? true;
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, phase, destination_id, start_date, end_date, tz,
       current_version_id)
     VALUES (?, ?, 'confirmed', ?, ?, '2026-11-02', '2026-11-08', ?, ?)`,
    [
      BALI_TRIP,
      BALI_CREW,
      options.phase ?? 'pre',
      BALI_DESTINATION,
      BALI_TZ,
      withPlan ? BALI_VERSION : null,
    ],
  );
  await db.execute(
    `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp) VALUES (?, ?, ?, ?, 'in')`,
    [`tp-${me}`, BALI_TRIP, me, options.role ?? 'organiser'],
  );
  if (!withPlan) return;
  for (const day of BALI_DAYS) {
    await db.execute(
      `INSERT INTO plan_days (id, version_id, trip_id, day_no, date, theme) VALUES (?, ?, ?, ?, ?, ?)`,
      [`day-${day.dayNo}`, BALI_VERSION, BALI_TRIP, day.dayNo, day.date, day.theme],
    );
  }
  for (const item of BALI_ITEMS) {
    await db.execute(
      `INSERT INTO plan_items (id, version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         attendee_ids, poi_id, booking_id, category, status, created_by_kind, locked_reason,
         amount_minor, currency, cost_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'user', ?, ?, ?, ?)`,
      [
        `item-${item.stableId}`,
        BALI_VERSION,
        `day-${item.dayNo}`,
        BALI_TRIP,
        item.stableId,
        item.startsAt,
        item.endsAt,
        item.tz,
        JSON.stringify(item.attendeeIds),
        item.poiId,
        item.bookingId,
        item.category,
        item.lockedReason,
        item.amountMinor,
        item.currency,
        item.costModel,
      ],
    );
    await db.execute(
      `INSERT INTO pois (id, destination_id, name, category, lat, lng) VALUES (?, ?, ?, ?, ?, ?)`,
      [item.poiId, BALI_DESTINATION, item.label, item.category, item.lat, item.lng],
    );
    if (item.bookingId !== null) {
      await db.execute(
        `INSERT INTO bookings (id, trip_id, title, status, starts_at) VALUES (?, ?, ?, 'booked', ?)`,
        [item.bookingId, BALI_TRIP, item.label, item.startsAt],
      );
    }
  }
  for (const poll of BALI_POLLS) {
    await db.execute(
      `INSERT OR IGNORE INTO polls (id, crew_id, trip_id, kind, status) VALUES (?, ?, ?, 'day_option', 'open')`,
      [poll.id, BALI_CREW, BALI_TRIP],
    );
    await db.execute(
      `INSERT INTO poll_options (id, poll_id, crew_id, trip_id, kind, ref_id, label) VALUES (?, ?, ?, ?, 'poi', ?, 'Option')`,
      [`opt-${poll.id}`, poll.id, BALI_CREW, BALI_TRIP, poll.ref_id],
    );
    for (let n = 0; n < poll.ballots; n += 1) {
      await db.execute(
        `INSERT INTO ballots (id, poll_id, option_id, crew_id, trip_id, user_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          `ballot-${poll.id}-${n}`,
          poll.id,
          `opt-${poll.id}`,
          BALI_CREW,
          BALI_TRIP,
          BALI_MEMBERS[n]?.user_id ?? me,
        ],
      );
    }
  }
  for (const row of BALI_WEATHER) {
    await db.execute(
      `INSERT INTO weather_snapshots (id, destination_id, point_key, date, hourly) VALUES (?, ?, 'centroid', ?, ?)`,
      [`wx-${row.date}`, BALI_DESTINATION, row.date, row.hourly],
    );
  }
}
