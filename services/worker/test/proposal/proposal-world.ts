/**
 * A crew of six on a proposed Kyoto trip: Maya organises, Rin, Dev, Alex and Jordan hold seats,
 * Sam is waiting for one. Plan items, priced cost components and a sent proposal with one version
 * per recipient. A job producer is registered so events route their pushes.
 */
import { randomUUID } from 'node:crypto';

import { registerJobProducer } from '@cp/db';
import { PROPOSAL_QUEUES } from '@cp/domain';
import type { PgBoss } from 'pg-boss';

import { createBoss } from '../../src/boss';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export const NAMES = ['Maya', 'Rin', 'Dev', 'Alex', 'Jordan', 'Sam'] as const;

export interface ProposalWorld {
  readonly harness: JobsHarness;
  readonly boss: PgBoss;
  readonly users: Readonly<Record<(typeof NAMES)[number], string>>;
  readonly crewId: string;
  readonly tripId: string;
  readonly versionId: string;
  readonly proposalId: string;
  readonly items: readonly string[];
  q<T>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

export async function startProposalWorld(): Promise<ProposalWorld> {
  const harness = await startJobsHarness();
  const boss = createBoss({
    connectionString: harness.postgres.getConnectionUri(),
    logger: silent,
  });
  await boss.start();
  for (const queue of [...Object.values(PROPOSAL_QUEUES), 'notify.route', 'cost.recompute']) {
    if ((await boss.getQueue(queue)) === null)
      await boss.createQueue(queue, { policy: 'standard' });
  }
  registerJobProducer(boss);
  const q = async <T>(sql: string, params: unknown[] = []) =>
    (await harness.pool.query(sql, params)).rows as T[];
  const one = async (sql: string, params: unknown[]) =>
    (await q<{ id: string }>(sql, params))[0]!.id;

  const users = Object.fromEntries(NAMES.map((name) => [name, randomUUID()])) as Record<
    (typeof NAMES)[number],
    string
  >;
  for (const name of NAMES) {
    await q(
      `INSERT INTO users (id, status, display_name, tz) VALUES ($1, 'registered', $2, 'Asia/Tokyo')`,
      [users[name], `${name} Test`],
    );
  }
  const crewId = await one(
    "INSERT INTO crews (name, created_by) VALUES ('Kyoto Six', $1) RETURNING id",
    [users.Maya],
  );
  for (const name of NAMES) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      users[name],
      name === 'Maya' ? 'organiser' : 'member',
    ]);
  }
  const tripId = await one(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  for (const status of ['won', 'setup', 'drafting', 'draft_review', 'proposed']) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  for (const name of NAMES) {
    await q(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp, waitlist_position) VALUES ($1, $2, $3, $4, $5)',
      [
        tripId,
        users[name],
        name === 'Maya' ? 'organiser' : 'member',
        name === 'Maya' ? 'in' : name === 'Sam' ? 'waitlisted' : 'unopened',
        name === 'Sam' ? 1 : null,
      ],
    );
  }
  const versionId = await one(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [tripId],
  );
  await q('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, versionId]);
  const day = await one(
    'INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, 1) RETURNING id',
    [versionId, tripId],
  );
  const items: string[] = [];
  for (const category of ['sight', 'food', 'activity']) {
    const rows = await q<{ stable_id: string }>(
      `INSERT INTO plan_items (version_id, day_id, trip_id, category, attendee_ids)
       VALUES ($1, $2, $3, $4, $5) RETURNING stable_id`,
      [versionId, day, tripId, category, [users.Dev]],
    );
    items.push(rows[0]!.stable_id);
  }
  for (const [key, kind, unit, amount] of [
    ['villa', 'stay', 'group', '250000'],
    ['boat', 'transfer', 'group', '50000'],
    ['kayak', 'activity', 'person', '12000'],
  ] as const) {
    await q(
      `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared,
                                    amount_minor, currency, source, seen_at, label)
       VALUES ($1, 'cv_test', $2, $3, $4, $5, $6, 'USD', 'user', now(), $2)`,
      [tripId, key, kind, unit, unit !== 'person', amount],
    );
  }
  const proposalId = await one(
    `INSERT INTO proposals (trip_id, version_id, created_by, reply_by, status, sent_at)
     VALUES ($1, $2, $3, now() + interval '5 days', 'sent', now() - interval '13 hours') RETURNING id`,
    [tripId, versionId, users.Maya],
  );
  for (const name of NAMES.slice(1)) {
    await q(
      'INSERT INTO proposal_versions (proposal_id, trip_id, recipient_id, lead_item_id) VALUES ($1, $2, $3, $4)',
      [proposalId, tripId, users[name], items[0]],
    );
  }
  return {
    harness,
    boss,
    users,
    crewId,
    tripId,
    versionId,
    proposalId,
    items,
    q,
    async stop() {
      await boss.stop({ graceful: false });
      await harness.close();
    },
  };
}
