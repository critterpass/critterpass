/**
 * The Bali trip as sync writes it into a phone's local database, for the trip day's screen tests:
 * me (Winston), Dev and Alex in one crew, the trip a week out, and today's briefing with a NUDGE
 * line about visa cash for Dev and Alex.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values and SQL. */
import { toLocalWallTime } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

export const SEED_TZ = 'Asia/Makassar';
export const SEED_CREW = '0192f000-0000-7000-8000-00000000c1e1';
export const SEED_TRIP = '0192f000-0000-7000-8000-00000000f101';
export const SEED_DEST = '0192f000-0000-7000-8000-00000000d101';
export const SEED_GUIDE = '0192f000-0000-7000-8000-00000000e101';
export const DEV = '0192f000-0000-7000-8000-0000000000d1';
export const ALEX = '0192f000-0000-7000-8000-0000000000a1';
export const BRIEFING = '0192f000-0000-7000-8000-00000000b101';
export const NUDGE_ITEM = '0192f000-0000-7000-8000-00000000b102';

function isoDate(offsetDays: number): string {
  const today = toLocalWallTime(new Date(), SEED_TZ).date;
  return new Date(Date.parse(`${today}T00:00:00Z`) + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function seedTripDay(
  db: AbstractPowerSyncDatabase,
  me: string,
  options: { readonly nudgeStatus?: string } = {},
): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    me,
  ]);
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?)', [
    me,
    'Winston',
    DEV,
    'Dev',
    ALEX,
    'Alex',
  ]);
  await db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [SEED_CREW, 'The Bali Six']);
  for (const [index, member] of [me, DEV, ALEX].entries()) {
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
       VALUES (?, ?, ?, 'active', ?)`,
      [`cm-${member}`, SEED_CREW, member, `2026-09-0${index + 1}T00:00:00Z`],
    );
  }
  await db.execute("INSERT INTO guides (id, slug, name) VALUES (?, 'tokek', 'Tokek')", [
    SEED_GUIDE,
  ]);
  await db.execute("INSERT INTO destinations (id, slug, name, tz) VALUES (?, 'bali', 'Bali', ?)", [
    SEED_DEST,
    SEED_TZ,
  ]);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, destination_id, guide_id, start_date, end_date, tz,
       local_currency, created_at)
     VALUES (?, ?, 'pre_trip', ?, ?, ?, ?, ?, 'USD', '2026-09-01')`,
    [SEED_TRIP, SEED_CREW, SEED_DEST, SEED_GUIDE, isoDate(7), isoDate(14), SEED_TZ],
  );
  for (const member of [me, DEV, ALEX]) {
    await db.execute(
      "INSERT INTO trip_participants (id, trip_id, user_id, rsvp) VALUES (?, ?, ?, 'in')",
      [`tp-${member}`, SEED_TRIP, member],
    );
  }
  await db.execute(
    `INSERT INTO briefings (id, trip_id, user_id, local_date, tz, status, fallback_used, built_at)
     VALUES (?, ?, ?, ?, ?, 'ready', 0, ?)`,
    [BRIEFING, SEED_TRIP, me, isoDate(0), SEED_TZ, new Date().toISOString()],
  );
  await db.execute(
    `INSERT INTO briefing_items (id, briefing_id, trip_id, user_id, position, icon, text, action,
       target_user_ids, status, source)
     VALUES (?, ?, ?, ?, 0, 'wallet', ?, 'nudge', ?, ?, 'model')`,
    [
      NUDGE_ITEM,
      BRIEFING,
      SEED_TRIP,
      me,
      "Visa on arrival is $35, cash only. Dev and Alex haven't got any yet.",
      JSON.stringify([DEV, ALEX]),
      options.nudgeStatus ?? 'open',
    ],
  );
}
