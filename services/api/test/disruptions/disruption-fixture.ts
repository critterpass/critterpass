/**
 * A trip with an open flight disruption as the disruption job leaves it: Rin's pickup by Made is a
 * guide draft waiting on a decision poll only Rin votes on (any affected), and the crew dinner
 * waits on a poll for all three. Seeded as the migration owner.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

export interface SeededDisruption {
  readonly id: string;
  readonly tripId: string;
  readonly pickupRow: string;
  readonly pickupPoll: { id: string; approve_option_id: string; keep_option_id: string };
  readonly dinnerRow: string;
  readonly dinnerPoll: string;
  readonly draftId: string;
}

async function poll(
  pool: pg.Pool,
  crewId: string,
  tripId: string,
  voters: string[],
  policy: string,
): Promise<{ id: string; approve_option_id: string; keep_option_id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, question, eligible_voter_ids, decider_policy,
       closes_at)
     VALUES ($1, $2, 'decision', 'Move it?', $3::uuid[], $4, now() + interval '2 hours')
     RETURNING id`,
    [crewId, tripId, voters, policy],
  );
  const id = rows[0]?.id as string;
  const options = await pool.query<{ id: string }>(
    `INSERT INTO poll_options (poll_id, crew_id, trip_id, kind, label, position)
     VALUES ($1, $2, $3, 'text', 'Approve', 0), ($1, $2, $3, 'text', 'Keep', 1) RETURNING id`,
    [id, crewId, tripId],
  );
  return {
    id,
    approve_option_id: options.rows[0]?.id as string,
    keep_option_id: options.rows[1]?.id as string,
  };
}

function row(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    autonomous: false,
    reversible: true,
    cost_delta_minor: 0,
    booking_impact: false,
    provider_id: null,
    starts_at: null,
    depends_on: null,
    decider: null,
    guide_action_id: null,
    vendor_message_id: null,
    decided_by: null,
    ...fields,
  };
}

export async function seedFlightDisruption(
  pool: pg.Pool,
  who: { organiser: string; traveller: string; other: string },
): Promise<SeededDisruption> {
  const everyone = [who.organiser, who.traveller, who.other];
  const crew = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Bali Six', $1) RETURNING id",
    [who.organiser],
  );
  const crewId = crew.rows[0]?.id as string;
  await pool.query(
    `INSERT INTO crew_members (crew_id, user_id, role)
     VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [crewId, ...everyone],
  );
  const trip = await pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status, tz) VALUES ($1, 'voting', 'Asia/Makassar') RETURNING id",
    [crewId],
  );
  const tripId = trip.rows[0]?.id as string;
  await pool.query(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
     VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in'), ($1, $4, 'member', 'in')`,
    [tripId, ...everyone],
  );
  const provider = await pool.query<{ id: string }>(
    "INSERT INTO providers (trip_id, kind, name) VALUES ($1, 'driver', 'Made') RETURNING id",
    [tripId],
  );
  const thread = await pool.query<{ id: string }>(
    `INSERT INTO ops.vendor_threads (trip_id, requested_by, provider_id, vendor_name, channel)
     VALUES ($1, $2, $3, 'Made', 'whatsapp_business') RETURNING id`,
    [tripId, who.traveller, provider.rows[0]?.id],
  );
  const draft = await pool.query<{ id: string }>(
    `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, proposed_by, intent, body, status)
     VALUES ($1, $2, 'outbound', 'guide', 'change', 'Hi Made, could you pick us up at 19:30?', 'draft')
     RETURNING id`,
    [thread.rows[0]?.id, tripId],
  );
  const pickupPoll = await poll(pool, crewId, tripId, [who.traveller], 'any_affected');
  const dinnerPoll = await poll(pool, crewId, tripId, everyone, 'majority_of_affected');
  const [pickupStable, dinnerStable] = [randomUUID(), randomUUID()];
  const pickupRow = `contact_vendor:${pickupStable}`;
  const dinnerRow = `retime_item:${dinnerStable}`;
  const actions = [
    row({
      id: pickupRow,
      kind: 'contact_vendor',
      class: 'vendor',
      state: 'draft_ready',
      affected_user_ids: [who.traveller],
      item_stable_id: pickupStable,
      facts: { vendor: 'Made', from: '18:00', to: '19:30', role: 'pickup' },
      poll: pickupPoll,
      vendor_message_id: draft.rows[0]?.id,
      label: 'Ask Made to pick you up at 19:30?',
    }),
    row({
      id: dinnerRow,
      kind: 'retime_item',
      class: 'plan',
      state: 'needs_yes',
      affected_user_ids: everyone,
      item_stable_id: dinnerStable,
      facts: { title: 'Dinner', from: '20:00', to: '21:00' },
      poll: dinnerPoll,
      label: 'Dinner 20:00 → 21:00',
    }),
  ];
  const disruption = await pool.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, title, summary, affected, actions)
     VALUES ($1, 'flight_delay', 'delay', $2, 'SQ938 lands at 19:00', 'Rin lands at 19:00.', $3, $4)
     RETURNING id`,
    [
      tripId,
      `flight:${randomUUID()}`,
      JSON.stringify({ traveller_ids: [who.traveller], item_stable_ids: [], unaffected_ids: [] }),
      JSON.stringify(actions),
    ],
  );
  return {
    id: disruption.rows[0]?.id as string,
    tripId,
    pickupRow,
    pickupPoll,
    dinnerRow,
    dinnerPoll: dinnerPoll.id,
    draftId: draft.rows[0]?.id as string,
  };
}
