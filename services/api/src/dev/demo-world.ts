/**
 * The demo crew for staging device testing: the caller organises "Bali Demo Crew" with four
 * clearly fake crewmates (no auth accounts, no avatars, "Demo" surnames), a confirmed Bali trip
 * three weeks out that Tokek guides, a started plan, a guide change still inside its undo window
 * and a few chat messages. Rows are written as `app_system` the way the owning features write them
 * (the crew and membership as `create_crew` does, the trip as the trip machine allows, the guide
 * change through `app.apply_change_set`), never through a shortcut the app could not produce.
 */
import { countdownTarget, encodeMemberColour, memberColourForSlot } from '@cp/domain';
import type pg from 'pg';

export const DEMO_CREW_NAME = 'Bali Demo Crew';
const DEMO_DESTINATION = { slug: 'bali', name: 'Bali', country: 'Indonesia', currency: 'IDR' };
const DEMO_TZ = 'Asia/Makassar';
const DEMO_GUIDE = { slug: 'tokek', name: 'Tokek', colour: 'yellow' };
/** Days from today to the trip's first day, and how long it lasts. */
const LEAD_DAYS = 21;
const TRIP_NIGHTS = 6;
const PLAN_PROGRESS = 62;

export interface DemoMember {
  readonly key: 'maya' | 'jordan' | 'alex' | 'rin';
  readonly name: string;
  readonly rsvp: 'in' | 'unopened';
}

export const DEMO_MEMBERS: readonly DemoMember[] = [
  { key: 'maya', name: 'Maya Demo', rsvp: 'in' },
  { key: 'jordan', name: 'Jordan Demo', rsvp: 'in' },
  { key: 'alex', name: 'Alex Demo', rsvp: 'in' },
  { key: 'rin', name: 'Rin Demo', rsvp: 'unopened' },
];

const CHAT: readonly { readonly from: DemoMember['key'] | 'me'; readonly body: string }[] = [
  { from: 'maya', body: 'Villa is booked! Pool faces the rice fields 🌾' },
  { from: 'jordan', body: 'Can we do Uluwatu at sunset on day two?' },
  { from: 'me', body: 'Yes, added it to the plan.' },
  { from: 'alex', body: 'I land at 09:40, anyone on the same flight?' },
  { from: 'maya', body: 'Rin still has to say if they are in 👀' },
];

export interface DemoWorld {
  readonly crewId: string;
  readonly tripId: string;
  readonly guideId: string;
  readonly destinationId: string;
  readonly members: Readonly<Record<DemoMember['key'], string>>;
  readonly created: boolean;
}

async function one<T>(tx: pg.PoolClient, sql: string, values: unknown[]): Promise<T> {
  const { rows } = await tx.query<T & pg.QueryResultRow>(sql, values);
  const row = rows[0];
  if (row === undefined) throw new Error('demo seed: expected a row back');
  return row;
}

/** Tokek and Bali, as the content catalogue ships them (a no-op where they already exist). */
async function catalogue(tx: pg.PoolClient): Promise<{ guideId: string; destinationId: string }> {
  await tx.query(
    'INSERT INTO guides (slug, name, colour) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING',
    [DEMO_GUIDE.slug, DEMO_GUIDE.name, DEMO_GUIDE.colour],
  );
  await tx.query(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, $2, $3, 'live', $4, $5) ON CONFLICT (slug) DO NOTHING`,
    [
      DEMO_DESTINATION.slug,
      DEMO_DESTINATION.name,
      DEMO_DESTINATION.country,
      DEMO_DESTINATION.currency,
      DEMO_TZ,
    ],
  );
  const guide = await one<{ id: string }>(tx, 'SELECT id FROM guides WHERE slug = $1', [
    DEMO_GUIDE.slug,
  ]);
  const destination = await one<{ id: string }>(tx, 'SELECT id FROM destinations WHERE slug = $1', [
    DEMO_DESTINATION.slug,
  ]);
  return { guideId: guide.id, destinationId: destination.id };
}

/** `YYYY-MM-DD` of `now` plus `days`, in the destination's zone. */
function localDate(now: Date, days: number): string {
  const shifted = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TZ }).format(shifted);
}

async function existingWorld(tx: pg.PoolClient, uid: string) {
  const { rows } = await tx.query<{ crew_id: string; trip_id: string | null }>(
    `SELECT c.id AS crew_id,
            (SELECT t.id FROM trips t WHERE t.crew_id = c.id ORDER BY t.created_at LIMIT 1) AS trip_id
       FROM crews c JOIN crew_members m ON m.crew_id = c.id AND m.user_id = $1 AND m.status = 'active'
      WHERE c.created_by = $1 AND c.name = $2
      ORDER BY c.created_at LIMIT 1`,
    [uid, DEMO_CREW_NAME],
  );
  return rows[0];
}

async function memberIds(tx: pg.PoolClient, crewId: string, uid: string) {
  const { rows } = await tx.query<{ user_id: string; display_name: string }>(
    `SELECT m.user_id, u.display_name FROM crew_members m JOIN users u ON u.id = m.user_id
      WHERE m.crew_id = $1 AND m.user_id <> $2`,
    [crewId, uid],
  );
  const ids: Partial<Record<DemoMember['key'], string>> = {};
  for (const member of DEMO_MEMBERS) {
    const row = rows.find((candidate) => candidate.display_name === member.name);
    if (row === undefined) throw new Error(`demo seed: ${member.name} is missing from the crew`);
    ids[member.key] = row.user_id;
  }
  return ids as Record<DemoMember['key'], string>;
}

async function createCrew(tx: pg.PoolClient, uid: string) {
  const crew = await one<{ id: string }>(
    tx,
    'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
    [DEMO_CREW_NAME, uid],
  );
  await tx.query(
    `INSERT INTO crew_members (crew_id, user_id, role, colour) VALUES ($1, $2, 'organiser', $3)`,
    [crew.id, uid, encodeMemberColour(memberColourForSlot(0))],
  );
  const members: Partial<Record<DemoMember['key'], string>> = {};
  for (const [index, member] of DEMO_MEMBERS.entries()) {
    const user = await one<{ id: string }>(
      tx,
      `INSERT INTO users (id, status, display_name, home_airport, home_country, locale, tz)
       VALUES (uuidv7(), 'registered', $1, 'SIN', 'Singapore', 'en', 'Asia/Singapore') RETURNING id`,
      [member.name],
    );
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role, colour) VALUES ($1, $2, 'member', $3)`,
      [crew.id, user.id, encodeMemberColour(memberColourForSlot(index + 1))],
    );
    members[member.key] = user.id;
  }
  // Rin has the app (so a nudge reaches their inbox) but never allowed notifications.
  await tx.query(
    `INSERT INTO devices (id, user_id, platform, bundle_id, app_version, locale, tz, permission_state)
     VALUES (uuidv7(), $1, 'ios', 'app.critterpass.staging', '1.0.0', 'en', 'Asia/Singapore',
             '{"notif": "denied"}')`,
    [members.rin],
  );
  return { crewId: crew.id, members: members as Record<DemoMember['key'], string> };
}

async function createTrip(
  tx: pg.PoolClient,
  crewId: string,
  catalogueIds: { guideId: string; destinationId: string },
  people: readonly { readonly uid: string; readonly role: string; readonly rsvp: string }[],
  now: Date,
): Promise<string> {
  const trip = await one<{ id: string }>(
    tx,
    `INSERT INTO trips (crew_id, status, destination_id, guide_id, start_date, end_date, tz,
       local_currency, seat_cap, plan_progress)
     VALUES ($1, 'voting', $2, $3, $4, $5, $6, $7, 6, $8) RETURNING id`,
    [
      crewId,
      catalogueIds.destinationId,
      catalogueIds.guideId,
      localDate(now, LEAD_DAYS),
      localDate(now, LEAD_DAYS + TRIP_NIGHTS),
      DEMO_TZ,
      DEMO_DESTINATION.currency,
      PLAN_PROGRESS,
    ],
  );
  // The trip machine accepts one hop per update: voted, set up, drafted, reviewed, confirmed.
  for (const status of ['won', 'setup', 'drafting', 'draft_review', 'proposed', 'confirmed']) {
    await tx.query('UPDATE trips SET status = $1 WHERE id = $2', [status, trip.id]);
  }
  for (const person of people) {
    await tx.query(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [trip.id, person.uid, person.role, person.rsvp],
    );
  }
  return trip.id;
}

/** Keeps the trip three weeks out and every participant's countdown on its first day. */
async function refreshDates(tx: pg.PoolClient, tripId: string, now: Date): Promise<void> {
  const startDate = localDate(now, LEAD_DAYS);
  await tx.query('UPDATE trips SET start_date = $2, end_date = $3 WHERE id = $1', [
    tripId,
    startDate,
    localDate(now, LEAD_DAYS + TRIP_NIGHTS),
  ]);
  const target = countdownTarget('', [], { startDate, tz: DEMO_TZ });
  await tx.query('UPDATE trip_participants SET countdown_target_at = $2 WHERE trip_id = $1', [
    tripId,
    target,
  ]);
}

async function postChat(
  tx: pg.PoolClient,
  crewId: string,
  tripId: string,
  senders: Readonly<Record<DemoMember['key'] | 'me', string>>,
): Promise<void> {
  for (const line of CHAT) {
    await tx.query(
      `INSERT INTO messages (crew_id, trip_id, sender_kind, sender_id, type, body)
       VALUES ($1, $2, 'user', $3, 'text', $4)`,
      [crewId, tripId, senders[line.from], line.body],
    );
  }
}

/** Finds or builds the caller's demo crew and trip; dates always move to three weeks out. */
export async function ensureDemoWorld(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
): Promise<DemoWorld> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo-seed:${uid}`]);
  const catalogueIds = await catalogue(tx);
  const existing = await existingWorld(tx, uid);
  let world: DemoWorld;
  if (existing?.trip_id != null) {
    world = {
      crewId: existing.crew_id,
      tripId: existing.trip_id,
      ...catalogueIds,
      members: await memberIds(tx, existing.crew_id, uid),
      created: false,
    };
  } else {
    const { crewId, members } = await createCrew(tx, uid);
    const tripId = await createTrip(
      tx,
      crewId,
      catalogueIds,
      [
        { uid, role: 'organiser', rsvp: 'in' },
        ...DEMO_MEMBERS.map((member) => ({
          uid: members[member.key],
          role: 'member',
          rsvp: member.rsvp,
        })),
      ],
      now,
    );
    await postChat(tx, crewId, tripId, { ...members, me: uid });
    world = { crewId, tripId, ...catalogueIds, members, created: true };
  }
  await refreshDates(tx, world.tripId, now);
  await tx.query(
    `INSERT INTO user_settings (user_id, active_crew_id) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET active_crew_id = EXCLUDED.active_crew_id`,
    [uid, world.crewId],
  );
  return world;
}
