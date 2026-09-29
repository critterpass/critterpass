/**
 * `ask_availability` / `answer_availability_ask` (docs/api-contracts.md §4.5). The organiser asks
 * the guide to check with the one member blocking the best week, only through that week's
 * "ask first" option (so nobody can probe who has which days). The guide writes to that member
 * privately (N-05); the organiser never reads the ask, only its outcome on the option: freed, not
 * movable, or timed out after 48 hours. The member answers with a quick reply, or in words the
 * guide reads the intent of and then forgets.
 */
import { cancelScheduledEvent, emitEvent, scheduleEvent, sendInTx } from '@cp/db';
import {
  answerAvailabilityAskPayloadSchema,
  askAvailabilityPayloadSchema,
  AVAILABILITY_ASK_TIMEOUT_HOURS,
  DomainError,
  SETUP_QUEUES,
  SETUP_RT,
  type AskAnswer,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import {
  publishSetup,
  queueWindowRecompute,
  requireOrganiser,
  requireStatus,
  setupMemberIds,
  SETUP_OPEN_STATUSES,
} from './shared';

export interface AskResult {
  readonly ask_id: string;
  readonly status: 'asked' | 'replied' | 'reading' | 'timed_out';
}

export const askAvailabilityCommand = defineCommand({
  name: 'ask_availability',
  v: 1,
  schema: askAvailabilityPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx): Promise<AskResult> => {
    if (payload.target_uid === ctx.uid) throw new DomainError('VALIDATION', { reason: 'self_ask' });
    const trip = await requireOrganiser(tx, payload.trip_id);
    if (!(await setupMemberIds(tx, trip.id)).includes(payload.target_uid)) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_setup' });
    }
    const { rows: options } = await tx.query<{ id: string; start: string; end: string }>(
      `SELECT id, start_date::text AS start, end_date::text AS "end" FROM date_window_options
        WHERE id = $1 AND trip_id = $2 AND kind = 'ask_first' AND ask_user_id = $3`,
      [payload.option_id ?? null, trip.id, payload.target_uid],
    );
    const option = options[0];
    if (
      option === undefined ||
      payload.range.start < option.start ||
      payload.range.end > option.end
    ) {
      throw new DomainError('STATE_INVALID', { reason: 'not_askable' });
    }
    const expiresAt = new Date(
      ctx.clock.serverNow.getTime() + AVAILABILITY_ASK_TIMEOUT_HOURS * 3_600_000,
    );
    const asked = await asSystemRole(tx, async () => {
      const open = await tx.query<{ id: string }>(
        `SELECT id FROM availability_asks WHERE trip_id = $1 AND target_user_id = $2 AND status = 'asked'`,
        [trip.id, payload.target_uid],
      );
      if (open.rows[0] !== undefined) return { id: open.rows[0].id, fresh: false };
      const block = await tx.query<{ first: string | null; last: string | null }>(
        `SELECT min(date)::text AS first, max(date)::text AS last FROM calendar_days
          WHERE user_id = $1 AND guide_may_ask AND date BETWEEN $2 AND $3`,
        [payload.target_uid, payload.range.start, payload.range.end],
      );
      const { first, last } = block.rows[0] ?? { first: null, last: null };
      if (first === null || last === null) {
        throw new DomainError('STATE_INVALID', { reason: 'not_askable' });
      }
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO availability_asks (trip_id, target_user_id, requested_by, option_id,
           block_start, block_end, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [trip.id, payload.target_uid, ctx.uid, option.id, first, last, expiresAt],
      );
      await tx.query(`UPDATE date_window_options SET ask_status = 'asked' WHERE id = $1`, [
        option.id,
      ]);
      return { id: rows[0]?.id as string, fresh: true };
    });
    if (asked.fresh) {
      await sendInTx(
        tx,
        SETUP_QUEUES.availabilityAsk,
        { ask_id: asked.id },
        { singletonKey: asked.id },
      );
      await scheduleEvent(tx, {
        kind: SETUP_QUEUES.askTimeout,
        refId: asked.id,
        tz: trip.tz ?? 'UTC',
        at: expiresAt,
      });
      await publishSetup(tx, trip.id, SETUP_RT.askStatus, {
        option_id: option.id,
        status: 'asked',
      });
    }
    return { ask_id: asked.id, status: 'asked' };
  },
});

/** Settles an open ask (the quick reply, or the guide's reading of a written one). */
export async function settleAsk(
  tx: pg.PoolClient,
  askId: string,
  answer: AskAnswer,
  actor: { kind: 'user' | 'guide'; id: string | null },
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
  if (answer === 'freed') await queueWindowRecompute(tx, settled.trip_id);
  if (settled.option_id !== null) {
    await publishSetup(tx, settled.trip_id, SETUP_RT.askStatus, {
      option_id: settled.option_id,
      status: answer,
    });
  }
  await emitEvent(tx, {
    type: 'availability_ask.answered',
    aggregateKind: 'availability_ask',
    aggregateId: askId,
    actorKind: actor.kind,
    actorId: actor.id,
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

export const answerAvailabilityAskCommand = defineCommand({
  name: 'answer_availability_ask',
  v: 1,
  schema: answerAvailabilityAskPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'inbox',
  authorize: async (tx, payload) => {
    // RLS shows an ask to the member it was sent to and nobody else.
    const { rowCount } = await tx.query('SELECT 1 FROM availability_asks WHERE id = $1', [
      payload.ask_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'availability_ask' });
  },
  handle: async (tx, payload, ctx): Promise<AskResult> =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ status: 'asked' | 'replied' | 'timed_out' }>(
        'SELECT status FROM availability_asks WHERE id = $1 AND target_user_id = $2 FOR UPDATE',
        [payload.ask_id, ctx.uid],
      );
      const status = rows[0]?.status;
      if (status === undefined) throw new DomainError('NOT_FOUND', { reason: 'availability_ask' });
      if (status !== 'asked') return { ask_id: payload.ask_id, status };
      if (payload.answer !== undefined) {
        await settleAsk(tx, payload.ask_id, payload.answer, { kind: 'user', id: ctx.uid });
        return { ask_id: payload.ask_id, status: 'replied' };
      }
      await tx.query('UPDATE availability_asks SET reply_text = $2 WHERE id = $1', [
        payload.ask_id,
        payload.text ?? null,
      ]);
      await sendInTx(
        tx,
        SETUP_QUEUES.askReply,
        { ask_id: payload.ask_id },
        {
          singletonKey: payload.ask_id,
        },
      );
      return { ask_id: payload.ask_id, status: 'reading' };
    }),
});
