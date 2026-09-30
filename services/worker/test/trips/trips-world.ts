/**
 * A migrated Postgres with two destinations (Da Nang on Asia/Ho_Chi_Minh, Los Angeles on
 * America/Los_Angeles, a negative offset), a crew of three and a helper that builds a trip in any
 * status by walking the real machine, so the status guard trigger sees every step.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';

import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export const HCM = 'Asia/Ho_Chi_Minh';
export const LAX = 'America/Los_Angeles';

const PATH = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
  'archived',
];

export interface TripInput {
  readonly status: string;
  readonly tz?: typeof HCM | typeof LAX;
  readonly start?: string | null;
  readonly end?: string | null;
  /** Participant RSVPs, one per member in order (default: everyone IN). */
  readonly rsvps?: readonly string[];
}

export interface TripsWorld {
  readonly harness: JobsHarness;
  readonly members: readonly [string, string, string];
  readonly crewId: string;
  q<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  trip(input: TripInput): Promise<string>;
  status(tripId: string): Promise<string>;
  moves(tripId: string): Promise<string[]>;
  stop(): Promise<void>;
}

export async function startTripsWorld(): Promise<TripsWorld> {
  const harness = await startJobsHarness();
  const q = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> =>
    withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
  const id = async (sql: string, params: readonly unknown[]) =>
    ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;

  const members = [randomUUID(), randomUUID(), randomUUID()] as const;
  for (const [i, uid] of members.entries()) {
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      `Member${i} X`,
    ]);
  }
  const crewId = await id(
    "INSERT INTO crews (name, created_by) VALUES ('Trips', $1) RETURNING id",
    [members[0]],
  );
  await q(
    `INSERT INTO crew_members (crew_id, user_id, role)
     VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
    [crewId, ...members],
  );
  const destinations: Record<string, string> = {};
  for (const [slug, tz] of [
    ['da-nang', HCM],
    ['los-angeles', LAX],
  ] as const) {
    destinations[tz] = await id(
      "INSERT INTO destinations (slug, name, country, tz) VALUES ($1, $1, 'VN', $2) RETURNING id",
      [slug, tz],
    );
  }

  const trip = async (input: TripInput): Promise<string> => {
    const tz = input.tz ?? HCM;
    const tripId = await id(
      `INSERT INTO trips (crew_id, status, destination_id, tz, start_date, end_date)
       VALUES ($1, 'voting', $2, $3, $4, $5) RETURNING id`,
      [crewId, destinations[tz], tz, input.start ?? null, input.end ?? null],
    );
    const rsvps = input.rsvps ?? ['in', 'in', 'in'];
    for (const [i, uid] of members.entries()) {
      await q(
        `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)`,
        [tripId, uid, i === 0 ? 'organiser' : 'member', rsvps[i] ?? 'in'],
      );
    }
    const walk =
      input.status === 'voting'
        ? []
        : input.status === 'cancelled'
          ? ['won', 'setup', 'cancelled']
          : PATH.slice(0, PATH.indexOf(input.status) + 1);
    for (const status of walk)
      await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
    return tripId;
  };

  return {
    harness,
    members,
    crewId,
    q,
    trip,
    async status(tripId) {
      return (
        (await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [tripId]))[0] as {
          status: string;
        }
      ).status;
    },
    async moves(tripId) {
      // The event log is not app_system's to read; the owner connection reads it.
      const { rows } = await harness.pool.query<{ move: string }>(
        `SELECT (payload->>'from') || '->' || (payload->>'to') AS move FROM domain_events
          WHERE type = 'trip.status_changed' AND aggregate_id = $1 ORDER BY occurred_at, id`,
        [tripId],
      );
      return rows.map((row) => row.move);
    },
    async stop() {
      await harness.close();
    },
  };
}
