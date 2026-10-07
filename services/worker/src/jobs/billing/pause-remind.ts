/**
 * `pause.remind` (the timer `set_pause_intent` arms a week before a planned Pass+ pause ends): when
 * the plan still stands and renewal is still off, `subscription.resume_due` goes out and the member
 * gets the reminder with the way back to Your plan. Someone who turned renewal back on, moved the
 * date, or has Pass+ again from anywhere else is not reminded.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { BILLING_PUSH, BILLING_QUEUES, pauseReminderDue } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { registerNotification } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

export async function remindPause(
  pool: pg.Pool,
  timer: Pick<ScheduledJobData, 'ref_id'>,
  now: Date,
): Promise<'reminded' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      user_id: string;
      status: string;
      auto_renew: boolean;
      resume_at: Date | null;
      pass_plus: boolean;
    }>(
      `SELECT s.user_id, s.status, s.auto_renew, s.resume_at,
              coalesce(e.pass_plus, false) AS pass_plus
         FROM subscriptions s LEFT JOIN user_entitlements e ON e.user_id = s.user_id
        WHERE s.id = $1`,
      [timer.ref_id],
    );
    const row = rows[0];
    if (
      row === undefined ||
      row.resume_at === null ||
      !pauseReminderDue(
        { status: row.status, autoRenew: row.auto_renew, resumeAt: row.resume_at },
        now,
      ) ||
      // The monthly plan lapsed but Pass+ is on: they came back another way (yearly, a gift).
      (row.status === 'expired' && row.pass_plus)
    ) {
      return 'gone';
    }
    await appendDomainEvent(tx, {
      type: 'subscription.resume_due',
      aggregateKind: 'subscription',
      aggregateId: timer.ref_id,
      actorKind: 'system',
      actorId: null,
      payload: {
        user_id: row.user_id,
        subscription_id: timer.ref_id,
        resume_at: row.resume_at.toISOString(),
      },
    });
    return 'reminded';
  });
}

export function pauseRemindJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: BILLING_QUEUES.pauseRemind,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await remindPause(ctx.pool, data, new Date()) }),
  });
}

/** "1 Mar": the day the pause ends, as the member picked it. */
export function formatResumeDate(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(at);
}

export function registerPauseReminderPush(): void {
  registerNotification({
    key: 'pass_resume_reminder',
    event: 'subscription.resume_due',
    audience: (_tx, routed) => {
      const uid = str(routed, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    compose(_tx, routed) {
      const resumeAt = new Date(str(routed, 'resume_at') ?? '');
      if (Number.isNaN(resumeAt.getTime())) return Promise.resolve(null);
      return Promise.resolve({
        title: BILLING_PUSH.resumeTitle,
        body: BILLING_PUSH.resumeBody,
        vars: { date: formatResumeDate(resumeAt) },
        sender: DEFAULT_SETUP_GUIDE,
        deepLink: '/you/plan',
        collapseVars: { subscription_id: str(routed, 'subscription_id') ?? '' },
      });
    },
  });
}
