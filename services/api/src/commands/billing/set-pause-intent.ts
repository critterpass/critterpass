/**
 * `set_pause_intent` (docs/api-contracts.md §4.15): a member on monthly Pass+ through the App
 * Store, which has no pause, says when they mean to come back after turning renewal off in the
 * store. The date goes on their subscription row and a reminder is armed a week before it. Nothing
 * is granted or taken away here: Pass+ follows the store, as always.
 */
import { cancelScheduledEvent, emitEvent, scheduleEvent } from '@cp/db';
import {
  BILLING_QUEUES,
  DomainError,
  pauseRemindAt,
  pauseResumeAllowed,
  setPauseIntentPayloadSchema,
  type SetPauseIntentResult,
} from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

interface PausableRow {
  readonly id: string;
  readonly resume_at: Date | null;
}

export async function setPauseIntent(
  tx: pg.PoolClient,
  uid: string,
  resumeAt: Date,
  now: Date,
): Promise<SetPauseIntentResult> {
  if (!pauseResumeAllowed(resumeAt, now)) {
    throw new DomainError('VALIDATION', { reason: 'resume_at' });
  }
  return asServer(tx, async () => {
    const { rows } = await tx.query<PausableRow>(
      `SELECT id, resume_at FROM subscriptions
        WHERE user_id = $1 AND platform = 'app_store' AND product_key = 'pass_monthly'
          AND status IN ('active', 'cancelled_active')
        FOR UPDATE`,
      [uid],
    );
    const subscription = rows[0];
    if (subscription === undefined) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'no_pausable_plan' });
    }
    const remindAt = pauseRemindAt(resumeAt);
    const timer = { kind: BILLING_QUEUES.pauseRemind, refId: subscription.id };
    if (remindAt.getTime() > now.getTime()) {
      await scheduleEvent(tx, { ...timer, tz: 'UTC', at: remindAt });
    } else {
      // Back within the week: a reminder would arrive on top of the plan itself.
      await cancelScheduledEvent(tx, timer);
    }
    if (subscription.resume_at?.getTime() !== resumeAt.getTime()) {
      await tx.query('UPDATE subscriptions SET resume_at = $2 WHERE id = $1', [
        subscription.id,
        resumeAt,
      ]);
      await emitEvent(tx, {
        type: 'subscription.pause_intended',
        aggregateKind: 'subscription',
        aggregateId: subscription.id,
        actorKind: 'user',
        actorId: uid,
        payload: {
          user_id: uid,
          subscription_id: subscription.id,
          resume_at: resumeAt.toISOString(),
        },
      });
    }
    return {
      subscription_id: subscription.id,
      resume_at: resumeAt.toISOString(),
      remind_at: remindAt.getTime() > now.getTime() ? remindAt.toISOString() : null,
    };
  });
}

export const setPauseIntentCommand = defineCommand({
  name: 'set_pause_intent',
  v: 1,
  schema: setPauseIntentPayloadSchema,
  offline: false,
  // A guest can hold Pass+ (purchases are open to them), so a guest can plan a pause as well.
  allowAnonymous: true,
  // Self only: the row is found by the caller's own uid.
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    setPauseIntent(tx, ctx.uid, new Date(payload.resume_at), ctx.clock.serverNow),
});
