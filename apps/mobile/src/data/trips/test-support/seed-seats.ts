/**
 * A crew on one trip whose seats are as sync delivers them: every answer a person can give, with
 * the server's generated seat column left empty, as it is on a real phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and fixture names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

const SEATS_CREW = '0199a6f0-0000-7000-8000-00000005c001';
export const SEATS_TRIP = '0199a6f0-0000-7000-8000-00000005e001';
export const SEAT_ME = '0199a6f0-0000-7000-8000-00000005a001';
const SEAT_MAYA = '0199a6f0-0000-7000-8000-00000005a002';
const SEAT_LINH = '0199a6f0-0000-7000-8000-00000005a003';
const SEAT_BAO = '0199a6f0-0000-7000-8000-00000005a004';
export const SEAT_KHOA = '0199a6f0-0000-7000-8000-00000005a005';
const SEAT_LAN = '0199a6f0-0000-7000-8000-00000005a006';

/** In joining order: who is on the trip and what each answered. */
const SEAT_PEOPLE = [
  { uid: SEAT_ME, name: 'Quoc Tran', rsvp: 'in' },
  { uid: SEAT_MAYA, name: 'Maya Le', rsvp: 'maybe' },
  { uid: SEAT_LINH, name: 'Linh Vo', rsvp: 'unopened' },
  { uid: SEAT_BAO, name: 'Bao Ngo', rsvp: 'opened' },
  { uid: SEAT_KHOA, name: 'Khoa Do', rsvp: 'out' },
  { uid: SEAT_LAN, name: 'Lan Ho', rsvp: 'waitlisted' },
] as const;

/** The people holding a seat, in joining order: everyone but the one out and the one waiting. */
export const SEAT_HOLDERS: readonly string[] = [SEAT_ME, SEAT_MAYA, SEAT_LINH, SEAT_BAO];

/** Seeds the crew, its trip and the six people; `SEAT_ME` is the signed-in member. */
export async function seedSeats(db: AbstractPowerSyncDatabase): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    SEAT_ME,
  ]);
  await db.execute(`INSERT INTO crews (id, name, settlement_currency) VALUES (?, 'Crew', 'VND')`, [
    SEATS_CREW,
  ]);
  await db.execute(
    `INSERT INTO trips (id, crew_id, status, local_currency, tz, start_date, end_date)
     VALUES (?, ?, 'in_trip', 'VND', 'Asia/Ho_Chi_Minh', '2026-10-01', '2026-10-05')`,
    [SEATS_TRIP, SEATS_CREW],
  );
  for (const [index, person] of SEAT_PEOPLE.entries()) {
    const at = `2026-09-0${index + 1}T00:00:00Z`;
    await db.execute(
      `INSERT INTO users (id, display_name, home_currency, home_country) VALUES (?, ?, 'VND', 'VN')`,
      [person.uid, person.name],
    );
    await db.execute(
      `INSERT INTO crew_members (id, crew_id, user_id, status, role, created_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [`m-${person.uid}`, SEATS_CREW, person.uid, index === 0 ? 'organiser' : 'member', at],
    );
    await db.execute(
      `INSERT INTO trip_participants (id, trip_id, user_id, role, rsvp, holds_seat, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [
        `p-${person.uid}`,
        SEATS_TRIP,
        person.uid,
        index === 0 ? 'organiser' : 'member',
        person.rsvp,
        at,
      ],
    );
  }
}
