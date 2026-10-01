/**
 * A brand-new account's first trip, as staging syncs it: a one-member crew with a long name, a
 * trip still voting on its place (no destination, no dates) with one place pitched, and the
 * activity the server projected for it (its `text` is the event's i18n id, never copy).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and fixture rows, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

export const FRESH_CREW = '0192f000-0000-7000-8000-00000000c2e2';
export const FRESH_TRIP = '0192f000-0000-7000-8000-00000000f202';
export const FRESH_POLL = '0192f000-0000-7000-8000-00000000a202';

export async function seedFreshVote(db: AbstractPowerSyncDatabase, me: string): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    me,
  ]);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?)', [me, 'Khanh']);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [
    FRESH_CREW,
    "The head still didn't look so goo",
  ]);
  await db.execute(
    `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
     VALUES (?, ?, ?, 'active', '2026-09-30T16:00:00Z')`,
    [`cm-${me}`, FRESH_CREW, me],
  );
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, created_at) VALUES (?, ?, 'voting', '2026-09-30')`,
    [FRESH_TRIP, FRESH_CREW],
  );
  await db.execute(
    "INSERT INTO trip_participants (id, trip_id, user_id, rsvp) VALUES (?, ?, ?, 'in')",
    [`tp-${me}`, FRESH_TRIP, me],
  );
  await db.execute(
    `INSERT INTO polls (id, crew_id, trip_id, kind, stage, status, created_by, created_at)
     VALUES (?, ?, ?, 'destination', 'board', 'open', ?, '2026-09-30T16:01:00Z')`,
    [FRESH_POLL, FRESH_CREW, FRESH_TRIP, me],
  );
  const events = [
    ['created', 'trip', FRESH_TRIP, 'activity.trip_created', '2026-09-30T16:01:00Z'],
    ['asked', 'poll', FRESH_POLL, 'activity.poll_created', '2026-09-30T16:01:01Z'],
    [
      'pitched',
      'poll_option',
      'po-danang',
      'activity.poll_candidate_added',
      '2026-09-30T16:02:00Z',
    ],
  ] as const;
  for (const [verb, kind, object, text, at] of events) {
    await db.execute(
      `INSERT INTO activity_events (id, crew_id, trip_id, actor_id, verb, object_kind, object_id,
         text, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`ae-${verb}`, FRESH_CREW, FRESH_TRIP, me, verb, kind, object, text, at],
    );
  }
}
