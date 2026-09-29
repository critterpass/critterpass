/**
 * Availability jobs against a migrated Postgres: the window recompute writes counts and options
 * (an ask's outcome stays on its option), the guide's private ask files its N-05 for the member
 * alone with the dates filled in only at delivery, a written reply is read on the decision route
 * (DeepSeek's fast-tier twin replayed from a live recording) and settles the ask like a quick
 * reply, and an unanswered ask times out after 48 hours with the outcome to whoever asked.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { registerSetupPushes } from '../../src/jobs/setup';
import { readAvailabilityReply, sendAvailabilityAsk } from '../../src/jobs/setup/availability-ask';
import { timeOutAsk } from '../../src/jobs/setup/availability-ask-timeout';
import { recomputeWindows } from '../../src/jobs/setup/window-recompute';
import { startSetupWorld, type SetupWorld } from './setup-fixture';

let world: SetupWorld;
const NOW = new Date();
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(NOW);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const replyFixture = JSON.parse(
  readFileSync(
    new URL('../../../../packages/ai/test/fixtures/deepseek/reply-01.json', import.meta.url),
    'utf8',
  ),
) as { response: { status: number; body: unknown } };

async function mark(uid: string, offsets: readonly number[], state: string, mayAsk = false) {
  for (const offset of offsets) {
    await world.q(
      `INSERT INTO calendar_days (user_id, date, state, source, guide_may_ask)
       VALUES ($1, $2, $3, 'manual', $4)
       ON CONFLICT (user_id, date) DO UPDATE SET state = EXCLUDED.state,
         guide_may_ask = EXCLUDED.guide_may_ask`,
      [uid, day(offset), state, mayAsk],
    );
  }
}

async function routed(type: string): Promise<RoutedEvent> {
  const [row] = await world.q<{ id: string; payload: Record<string, unknown>; trip_id: string }>(
    'SELECT id, payload, trip_id FROM domain_events WHERE type = $1 ORDER BY occurred_at DESC LIMIT 1',
    [type],
  );
  if (row === undefined) throw new Error(`no ${type} event`);
  return {
    id: row.id,
    type,
    payload: row.payload,
    crewId: world.crewId,
    tripId: row.trip_id,
    actorId: null,
    occurredAt: NOW,
  };
}

async function newAsk(target: string, expiresAt: Date, optionId: string | null) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO availability_asks (trip_id, target_user_id, requested_by, option_id, block_start,
       block_end, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [world.tripId, target, world.members[0], optionId, day(20), day(21), expiresAt],
  );
  return row?.id as string;
}

beforeAll(async () => {
  world = await startSetupWorld(4);
  registerSetupPushes();
  const [organiser, rin, dev, mei] = world.members as [string, string, string, string];
  for (const uid of [organiser, rin, mei]) await mark(uid, [20, 21, 22, 23, 24], 'free');
  await mark(dev, [22, 23, 24], 'free');
  await mark(dev, [20, 21], 'maybe', true);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('setup.window_recompute', () => {
  it('writes the counts and the ask-first option, and tells the crew counts only', async () => {
    const result = await recomputeWindows(world.harness.pool, world.tripId, NOW);
    expect(result.outcome).toBe('recomputed');
    const options = await world.q<{ kind: string; start_date: string; ask_user_id: string | null }>(
      `SELECT kind, start_date::text AS start_date, ask_user_id FROM date_window_options
        WHERE trip_id = $1 ORDER BY position`,
      [world.tripId],
    );
    expect(options[0]).toMatchObject({ kind: 'best', start_date: day(22) });
    const [summary] = await world.q<{ free_count: number; maybe_count: number }>(
      'SELECT free_count, maybe_count FROM availability_summaries WHERE trip_id = $1 AND date = $2',
      [world.tripId, day(20)],
    );
    expect(summary).toEqual({ free_count: 3, maybe_count: 1 });
    const hints = await world.q<{ payload: { type: string; data: Record<string, unknown> } }>(
      'SELECT payload FROM rt_outbox WHERE channel = $1',
      [`trip_setup:${world.tripId}`],
    );
    expect(hints.map((h) => h.payload.type)).toEqual(
      expect.arrayContaining(['calendar.sync_count', 'availability.updated', 'windows.updated']),
    );
    expect(JSON.stringify(hints)).not.toContain(day(20));
  });
});

describe('the private ask', () => {
  it('files N-05 for its member alone and fills the dates in at delivery', async () => {
    const dev = world.members[2] as string;
    const askId = await newAsk(dev, new Date(NOW.getTime() + 48 * 3_600_000), null);
    const lines: string[] = [];
    const outcome = await sendAvailabilityAsk(world.harness.pool, askId, (input) => {
      lines.push(`${input.name}|${input.place}`);
      return Promise.resolve({ line: 'Dev, can {dates} move for Kyoto?', source: 'model' });
    });
    expect(outcome).toBe('sent');
    expect(lines).toEqual(['Member2|Kyoto']);
    const registration = getRegistration('availability_ask.created', 'guide_availability_ask');
    const event = await routed('availability_ask.created');
    expect(await withSystem(world.harness.pool, (tx) => registration!.audience(tx, event))).toEqual(
      [dev],
    );
    const push = await withSystem(world.harness.pool, (tx) =>
      registration!.compose(tx, event, dev),
    );
    expect(push?.vars?.['line']).toMatch(/^Dev, can [A-Z][a-z]{2} \d+–\d+ move for Kyoto\?$/u);
    expect(
      await sendAvailabilityAsk(world.harness.pool, askId, () => Promise.reject(new Error('no'))),
    ).toBe('already_sent');
  });

  it('reads a written reply and settles the ask like a quick reply', async () => {
    const dev = world.members[2] as string;
    const [{ id: askId } = { id: '' }] = await world.q<{ id: string }>(
      "SELECT id FROM availability_asks WHERE target_user_id = $1 AND status = 'asked'",
      [dev],
    );
    await world.q('UPDATE availability_asks SET reply_text = $2 WHERE id = $1', [
      askId,
      'Done, I moved it. Count me in!',
    ]);
    const gateway = createGateway({
      apiKey: 'replay',
      maxAttempts: 1,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(replyFixture.response.body), {
            status: replyFixture.response.status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    });
    const decisions = createDecisionClient({ gateway });
    expect(await readAvailabilityReply(world.harness.pool, askId, decisions)).toBe('settled');
    const [ask] = await world.q<{ status: string; intent: string; reply_text: string | null }>(
      'SELECT status, intent, reply_text FROM availability_asks WHERE id = $1',
      [askId],
    );
    expect(ask).toEqual({ status: 'replied', intent: 'freed', reply_text: null });
    const maybe = await world.q(
      "SELECT 1 FROM calendar_days WHERE user_id = $1 AND state = 'maybe'",
      [dev],
    );
    expect(maybe).toHaveLength(0);
    const registration = getRegistration('availability_ask.answered', 'availability_reply');
    const event = await routed('availability_ask.answered');
    expect(await withSystem(world.harness.pool, (tx) => registration!.audience(tx, event))).toEqual(
      [world.members[0]],
    );
  });

  it('times an unanswered ask out after 48 hours, and only then', async () => {
    const mei = world.members[3] as string;
    const [option] = await world.q<{ id: string }>(
      `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date, free_count,
         member_count, ask_user_id, ask_status, reason)
       VALUES ($1, 3, 'ask_first', $2, $3, 3, 4, $4, 'asked', 'maybe_block') RETURNING id`,
      [world.tripId, day(20), day(24), mei],
    );
    const later = await newAsk(mei, new Date(NOW.getTime() + 3_600_000), option?.id ?? null);
    expect(await timeOutAsk(world.harness.pool, later, NOW)).toBe('not_due');
    expect(await timeOutAsk(world.harness.pool, later, new Date(NOW.getTime() + 7_200_000))).toBe(
      'timed_out',
    );
    const [row] = await world.q<{ ask_status: string }>(
      'SELECT ask_status FROM date_window_options WHERE id = $1',
      [option?.id],
    );
    expect(row?.ask_status).toBe('timed_out');
    expect(await timeOutAsk(world.harness.pool, later, new Date(NOW.getTime() + 7_200_000))).toBe(
      'not_open',
    );
  });
});
