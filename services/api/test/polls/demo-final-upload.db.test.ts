/**
 * The seeded destination final voted from a phone: the caller's ballot travels as a queued
 * `cast_ballot` through `POST /sync/upload`, is applied, and closes the 2–2 final. The crewmates
 * still hold their "vote needed" cards, so closing settles those cards and refreshes the
 * crewmates' badges on their own channels from inside the caller's command.
 */
import { withUser } from '@cp/db';
import { generateUuidV7, userChannel } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPollCommands } from '../../src/commands/polls';
import { registerDevRoutes } from '../../src/dev/routes';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let caller: SignedIn;
const logger = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(registerPollCommands, (app, deps) =>
    registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  routeNotificationsFromApiEvents();
  caller = await harness.signInAnonymously();
}, 240_000);

afterAll(async () => {
  await producer.stop({ graceful: false });
  await harness.stop();
});

async function upload(pollId: string, optionId: string) {
  const opId = generateUuidV7();
  const response = await harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: caller.cookie },
    body: JSON.stringify({
      ops: [
        {
          op_id: opId,
          cmd: 'cast_ballot',
          v: 1,
          actor: { uid: caller.uid, via: 'offline' },
          device: { id: 'device-phone', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Saigon' },
          client_ts: new Date().toISOString(),
          payload: { poll_id: pollId, option_id: optionId },
        },
      ],
    }),
  });
  expect(response.status).toBeLessThan(300);
  const { rows } = await harness.pool.query<{ status: string; code: string | null }>(
    'SELECT status, code FROM cmd_results WHERE op_id = $1',
    [opId],
  );
  return rows[0];
}

/** The seeded 2–2 final, with every crewmate still holding their "vote needed" card. */
async function seededFinal(): Promise<string> {
  const seeded = await harness.request('/v1/dev/seed-demo', {
    method: 'POST',
    headers: { cookie: caller.cookie },
    body: JSON.stringify({ scenario: 'vote_final' }),
  });
  expect(seeded.status).toBe(200);
  const { poll_id } = (await seeded.json()) as { poll_id: string };
  await harness.pool.query(
    `INSERT INTO inbox_items (user_id, trip_id, kind, needs_you, resolve_key)
       SELECT uid, p.trip_id, 'poll.vote_needed', true, 'poll:' || uid || ':' || p.id
         FROM polls p, unnest(p.eligible_voter_ids) AS uid
        WHERE p.id = $1 AND uid <> $2`,
    [poll_id, caller.uid],
  );
  return poll_id;
}

async function crewmatesOf(pollId: string): Promise<string[]> {
  const { rows } = await harness.pool.query<{ uid: string }>(
    'SELECT unnest(eligible_voter_ids)::text AS uid FROM polls WHERE id = $1',
    [pollId],
  );
  return rows.map((row) => row.uid).filter((uid) => uid !== caller.uid);
}

async function latestOutboxId(): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    'SELECT coalesce(max(id), 0)::text AS id FROM rt_outbox',
  );
  return rows[0]!.id;
}

/** Closed, every card settled, and a fresh badge event on each crewmate's own channel. */
async function closedForEveryone(pollId: string, since: string) {
  const { rows } = await harness.pool.query<{ status: string; open_cards: number }>(
    `SELECT p.status, (SELECT count(*)::int FROM inbox_items
                        WHERE resolve_key LIKE 'poll:%:' || p.id AND resolved_at IS NULL) AS open_cards
       FROM polls p WHERE p.id = $1`,
    [pollId],
  );
  const badges = await harness.pool.query<{ channel: string }>(
    `SELECT DISTINCT channel FROM rt_outbox
      WHERE id > $1::bigint AND payload->>'type' = 'badge.counts'`,
    [since],
  );
  const crewmates = await crewmatesOf(pollId);
  return {
    ...rows[0],
    badged: crewmates.every((uid) => badges.rows.some((row) => row.channel === userChannel(uid))),
  };
}

describe('closing the seeded final settles every crewmate', { timeout: 120_000 }, () => {
  it('applies the caller ballot uploaded from the queue and closes the final', async () => {
    const poll_id = await seededFinal();
    const { rows } = await harness.pool.query<{ id: string }>(
      `SELECT o.id FROM poll_options o JOIN destinations d ON d.id = o.ref_id
        WHERE o.poll_id = $1 AND d.slug = 'lisbon'`,
      [poll_id],
    );
    const since = await latestOutboxId();
    expect(await upload(poll_id, rows[0]!.id)).toEqual({ status: 'applied', code: null });
    expect(await closedForEveryone(poll_id, since)).toEqual({
      status: 'closed',
      open_cards: 0,
      badged: true,
    });
  });

  it('lets the organiser close the final early', async () => {
    const poll_id = await seededFinal();
    const since = await latestOutboxId();
    const response = await harness.request('/v1/cmd/close_poll', {
      method: 'POST',
      headers: { cookie: caller.cookie },
      body: JSON.stringify(envelope('close_poll', { poll_id })),
    });
    expect(response.status).toBe(200);
    expect(await closedForEveryone(poll_id, since)).toEqual({
      status: 'closed',
      open_cards: 0,
      badged: true,
    });
  });

  it('still keeps a member from publishing on a crewmate channel directly', async () => {
    const poll_id = await seededFinal();
    const [crewmate] = await crewmatesOf(poll_id);
    await expect(
      withUser(harness.pool, caller.uid, 'device-phone', (tx) =>
        tx.query("SELECT app.enqueue_rt($1, '{}'::jsonb)", [userChannel(crewmate!)]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
