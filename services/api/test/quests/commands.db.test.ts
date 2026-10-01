/**
 * Quest commands through the real doors against a migrated Postgres: a traveller signs up for a
 * live quest once (offline replays change nothing), never for a closed one or on someone else's
 * trip; the reward grant is closed to apps and, from the system door, pays a quest exactly once.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerQuestCommands } from '../../src/commands/quests';
import { grantQuestRewardCommand } from '../../src/commands/quests/grant-quest-reward';
import { startJobProducer } from '../../src/jobs/producer';
import {
  buildCritterFixture,
  localDate,
  TRIP_TZ,
  type CritterFixture,
} from '../critters/critters-fixture';
import { runCommand } from '../location/location-fixture';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let fx: CritterFixture;

beforeAll(async () => {
  harness = await startCommandDoors(registerQuestCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  fx = await buildCritterFixture(harness);
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

let slot = 0;

async function quest(scope: 'crew' | 'optional', status = 'active', xp = 120): Promise<string> {
  const [row] = await q<{ id: string }>(
    `INSERT INTO quests (trip_id, local_date, slot, template, params, metric, target, reward, title,
       body, scope, status, source, starts_at, ends_at, completed_at)
     VALUES ($1, $2, $3, 'log_expenses', '{"n": 2}', 'expenses', 2, $4, 'RECEIPT RUN',
       'Log 2 expenses today.', $5, $6, 'fallback', now() - interval '1 hour',
       now() + interval '6 hours', CASE WHEN $6 = 'completed' THEN now() END)
     RETURNING id`,
    [
      fx.tripId,
      localDate(TRIP_TZ, Math.floor(slot / 4) - 1),
      slot % 4,
      { xp, sticker: null, form_id: null },
      scope,
      status,
    ],
  );
  slot += 1;
  return row?.id as string;
}

describe('signup_quest', () => {
  it('signs a traveller up once, and an offline replay changes nothing', async () => {
    const id = await quest('optional');
    const opId = generateUuidV7();
    const first = await runCommand(harness, fx.rin, 'signup_quest', { quest_id: id }, { opId });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ result: { signed_up: true } });
    const replay = await runCommand(harness, fx.rin, 'signup_quest', { quest_id: id }, { opId });
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await runCommand(harness, fx.rin, 'signup_quest', { quest_id: id });
    expect(again.body).toMatchObject({ result: { signed_up: false } });
    const rows = await q('SELECT 1 FROM quest_signups WHERE quest_id = $1', [id]);
    expect(rows).toHaveLength(1);
  });

  it('refuses a closed quest, and a traveller who is out of the trip', async () => {
    const closed = await quest('optional', 'expired');
    const late = await runCommand(harness, fx.maya, 'signup_quest', { quest_id: closed });
    expect(late.status).toBe(409);
    const open = await quest('optional');
    const out = await runCommand(harness, fx.dropout, 'signup_quest', { quest_id: open });
    expect(out.status).toBe(403);
  });
});

describe('grant_quest_reward', () => {
  it('is closed to apps', async () => {
    const id = await quest('crew');
    const response = await runCommand(harness, fx.maya, 'grant_quest_reward', {
      quest_id: id,
      uids: [fx.maya.uid],
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const [row] = await q<{ status: string }>('SELECT status FROM quests WHERE id = $1', [id]);
    expect(row?.status).toBe('active');
  });

  it('pays a quest once, to travellers still on the trip', async () => {
    const id = await quest('crew', 'active', 150);
    const grant = () =>
      withSystem(harness.pool, (tx) =>
        grantQuestRewardCommand.handle(
          tx,
          { quest_id: id, uids: [fx.maya.uid, fx.rin.uid, fx.dropout.uid] },
          { uid: fx.maya.uid } as never,
        ),
      );
    expect(await grant()).toMatchObject({ completed: true });
    expect(await grant()).toMatchObject({ completed: false });
    const rows = await q<{ user_id: string | null; amount: number }>(
      "SELECT user_id, amount FROM xp_ledger WHERE source_kind = 'quest' AND source_id = $1",
      [id],
    );
    expect(rows.map((row) => row.user_id).sort()).toEqual([fx.maya.uid, fx.rin.uid, null].sort());
    expect(rows.every((row) => row.amount === 150)).toBe(true);
    const events = (
      await harness.pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM domain_events WHERE type = 'quest.completed' AND aggregate_id = $1",
        [id],
      )
    ).rows;
    expect(events[0]?.n).toBe(1);
  });
});
