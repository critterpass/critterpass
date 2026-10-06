/**
 * `record_phrase_practice` through the command door: every attempt is counted on the caller's own
 * progress row, a practice that went well inside a trip emits `phrase.practised` for the quest
 * evaluator, a retry emits nothing, and somebody else's custom card cannot be practised.
 */
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerGuideCommands } from '../../../src/commands/guide';
import { startJobProducer } from '../../../src/jobs/producer';
import { seedGuideTrip } from '../../ai/guide-action-seed';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;

beforeAll(async () => {
  harness = await startCommandDoors(registerGuideCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

async function send(session: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: string };
    },
  };
}

describe('record_phrase_practice', () => {
  it('counts attempts and emits phrase.practised only for a practice that went well', async () => {
    const me = await harness.signInAnonymously();
    const outsider = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, { organiser: me.uid, members: [] });
    const card = await send(me, 'request_phrase_card', {
      trip_id: tripId,
      purpose: 'Thank you',
      language: 'id',
      register: 'polite',
    });
    const phraseId = card.body.result?.['card_id'];
    const practice = { phrase_id: phraseId, trip_id: tripId, language: 'id' };

    const stranger = await send(outsider, 'record_phrase_practice', {
      ...practice,
      trip_id: null,
      outcome: 'ok',
    });
    expect(stranger.body.error).toMatchObject({ code: 'NOT_FOUND' });

    const retry = await send(me, 'record_phrase_practice', {
      ...practice,
      outcome: 'retry',
      score: 40,
    });
    expect(retry.body.result).toEqual({ attempts: 1, practised: false });
    const events = () =>
      harness.pool.query<{ payload: Record<string, unknown> }>(
        "SELECT payload FROM domain_events WHERE type = 'phrase.practised' AND trip_id = $1",
        [tripId],
      );
    expect((await events()).rowCount).toBe(0);

    const ok = await send(me, 'record_phrase_practice', { ...practice, outcome: 'ok', score: 90 });
    expect(ok.body.result).toEqual({ attempts: 2, practised: true });
    const progress = await harness.pool.query(
      `SELECT attempts, score, practised_at IS NOT NULL AS practised FROM phrase_progress
        WHERE user_id = $1 AND phrase_id = $2`,
      [me.uid, phraseId],
    );
    expect(progress.rows).toEqual([{ attempts: 2, score: 90, practised: true }]);
    const emitted = await events();
    expect(emitted.rows.map((row) => row.payload)).toEqual([
      { phrase_id: phraseId, trip_id: tripId, user_id: me.uid, language: 'id' },
    ]);
  });
});
