/**
 * The guide's private availability ask, worker side:
 * - `setup.availability_ask`: writes the guide's line to the member (the model never sees their
 *   calendar; it leaves `{dates}` for the push to fill), then files `availability_ask.created`,
 *   which sends N-05 to that member alone.
 * - `setup.ask_reply`: reads a written reply's intent on the `availability.reply_intent` decision
 *   route and settles the ask exactly like a quick reply would; an unclear reply leaves it open.
 *   The reply text is erased either way.
 * The AI calls run outside any transaction; a switched-off route or a failed call falls back to
 * the template line (the ask) or leaves the ask open (the reply).
 */
import { readAskReply, type AskLineResult, type DecisionClient, type writeAskLine } from '@cp/ai';
import { appendDomainEvent, cancelScheduledEvent, outbox, sendInTx, withSystem } from '@cp/db';
import { channelName, SETUP_QUEUES, SETUP_RT, type AskAnswer } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { firstName, setupFacts } from './facts';

export const askJobSchema = z.object({ ask_id: z.uuid() });
export type AskJob = z.infer<typeof askJobSchema>;

/** Writes one ask line (model or template). */
export type AskLineWriter = (input: Parameters<typeof writeAskLine>[1]) => Promise<AskLineResult>;

export async function sendAvailabilityAsk(
  pool: pg.Pool,
  askId: string,
  write: AskLineWriter,
): Promise<'sent' | 'already_sent' | 'closed' | 'missing'> {
  const facts = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      target_user_id: string;
      status: string;
      ask_line: string | null;
    }>('SELECT trip_id, target_user_id, status, ask_line FROM availability_asks WHERE id = $1', [
      askId,
    ]);
    const ask = rows[0];
    if (ask === undefined) return undefined;
    return {
      ask,
      trip: await setupFacts(tx, ask.trip_id),
      name: await firstName(tx, ask.target_user_id),
    };
  });
  if (facts === undefined || facts.trip === undefined) return 'missing';
  if (facts.ask.status !== 'asked') return 'closed';
  if (facts.ask.ask_line !== null) return 'already_sent';
  const { line } = await write({
    guide: facts.trip.persona,
    name: facts.name,
    place: facts.trip.place,
  });
  return withSystem(pool, async (tx) => {
    const { rowCount } = await tx.query(
      `UPDATE availability_asks SET ask_line = $2
        WHERE id = $1 AND status = 'asked' AND ask_line IS NULL`,
      [askId, line],
    );
    if (rowCount === 0) return 'already_sent';
    await appendDomainEvent(tx, {
      type: 'availability_ask.created',
      aggregateKind: 'availability_ask',
      aggregateId: askId,
      actorKind: 'guide',
      actorId: null,
      tripId: facts.ask.trip_id,
      payload: {
        trip_id: facts.ask.trip_id,
        ask_id: askId,
        target_user_id: facts.ask.target_user_id,
      },
    });
    return 'sent';
  });
}

/** Settles an open ask as the server: the outcome on its option, freed days, recount, hint, event. */
export async function settleAskAsSystem(
  tx: pg.PoolClient,
  askId: string,
  answer: AskAnswer,
): Promise<boolean> {
  const { rows } = await tx.query<{
    trip_id: string;
    option_id: string | null;
    target_user_id: string;
  }>('SELECT trip_id, option_id, target_user_id FROM app.resolve_availability_ask($1, $2)', [
    askId,
    answer,
  ]);
  const settled = rows[0];
  if (settled === undefined) return false;
  await cancelScheduledEvent(tx, { kind: SETUP_QUEUES.askTimeout, refId: askId });
  if (answer === 'freed') {
    await sendInTx(
      tx,
      SETUP_QUEUES.windowRecompute,
      { trip_id: settled.trip_id },
      {
        singletonKey: settled.trip_id,
      },
    );
  }
  if (settled.option_id !== null) {
    await outbox(tx, channelName('trip_setup', settled.trip_id), SETUP_RT.askStatus, {
      option_id: settled.option_id,
      status: answer,
    });
  }
  await appendDomainEvent(tx, {
    type: 'availability_ask.answered',
    aggregateKind: 'availability_ask',
    aggregateId: askId,
    actorKind: 'guide',
    actorId: null,
    tripId: settled.trip_id,
    payload: {
      trip_id: settled.trip_id,
      ask_id: askId,
      target_user_id: settled.target_user_id,
      answer,
    },
  });
  return true;
}

export async function readAvailabilityReply(
  pool: pg.Pool,
  askId: string,
  decisions: Pick<DecisionClient, 'decide'> | undefined,
): Promise<'settled' | 'unclear' | 'nothing_to_read'> {
  const text = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ reply_text: string | null }>(
      "SELECT reply_text FROM availability_asks WHERE id = $1 AND status = 'asked'",
      [askId],
    );
    return rows[0]?.reply_text ?? null;
  });
  if (text === null) return 'nothing_to_read';
  let intent: AskAnswer | null = null;
  if (decisions !== undefined) {
    try {
      intent = await readAskReply(decisions, text);
    } catch {
      intent = null;
    }
  }
  return withSystem(pool, async (tx) => {
    if (intent !== null && (await settleAskAsSystem(tx, askId, intent))) return 'settled';
    await tx.query('UPDATE availability_asks SET reply_text = NULL WHERE id = $1', [askId]);
    return 'unclear';
  });
}

export function availabilityAskJob(write: AskLineWriter): JobDefinition<AskJob> {
  return defineJob({
    queue: SETUP_QUEUES.availabilityAsk,
    schema: askJobSchema,
    singletonKey: (data) => data.ask_id,
    handler: async (data, ctx) => ({
      outcome: await sendAvailabilityAsk(ctx.pool, data.ask_id, write),
    }),
  });
}

export function askReplyJob(
  decisions: Pick<DecisionClient, 'decide'> | undefined,
): JobDefinition<AskJob> {
  return defineJob({
    queue: SETUP_QUEUES.askReply,
    schema: askJobSchema,
    singletonKey: (data) => data.ask_id,
    handler: async (data, ctx) => ({
      outcome: await readAvailabilityReply(ctx.pool, data.ask_id, decisions),
    }),
  });
}
