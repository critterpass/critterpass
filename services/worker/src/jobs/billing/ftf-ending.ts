/**
 * `ftf.ending` (the timer a first-trip-free grant arms three days before its window closes, moved
 * whenever the trip's dates move): when the window is still open and in its last three days,
 * `ftf.ending_soon` goes out. The push (`free_boost_ending`, a governed paywall push) reaches only
 * the people on the trip who would lose its perks: nobody when the trip has a boost of its own that
 * outlasts the window, and never someone whose Pass+ comes from somewhere else.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import {
  BILLING_PUSH,
  BILLING_QUEUES,
  firstTripEndingLink,
  ftfDaysLeft,
  ftfEndingDue,
} from '@cp/domain';
import { BILLING_USER_LOADERS, passPlus, type RunQuery } from '@cp/entitlements';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';
import { governedCompose } from './governor-hook';
import { formatResumeDate } from './pause-remind';

interface GrantRow {
  readonly crew_id: string;
  readonly trip_id: string;
  readonly ends_at: Date;
  readonly abuse_decision: string;
}

export async function remindFtfEnding(
  pool: pg.Pool,
  timer: Pick<ScheduledJobData, 'ref_id'>,
  now: Date,
): Promise<'reminded' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<GrantRow>(
      'SELECT crew_id, trip_id, ends_at, abuse_decision FROM ftf_grants WHERE id = $1',
      [timer.ref_id],
    );
    const grant = rows[0];
    if (
      grant === undefined ||
      grant.abuse_decision === 'revoked' ||
      !ftfEndingDue(grant.ends_at, now)
    ) {
      return 'gone';
    }
    await appendDomainEvent(tx, {
      type: 'ftf.ending_soon',
      aggregateKind: 'ftf_grant',
      aggregateId: timer.ref_id,
      actorKind: 'system',
      actorId: null,
      crewId: grant.crew_id,
      tripId: grant.trip_id,
      payload: {
        crew_id: grant.crew_id,
        trip_id: grant.trip_id,
        grant_id: timer.ref_id,
        ends_at: grant.ends_at.toISOString(),
      },
    });
    return 'reminded';
  });
}

export function ftfEndingJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: BILLING_QUEUES.ftfEnding,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await remindFtfEnding(ctx.pool, data, new Date()) }),
  });
}

/**
 * Who loses something when the window closes: the trip's seated crew members, unless a boost of
 * the trip's own runs past the close, minus anyone who still has Pass+ once the window is gone.
 */
export async function ftfEndingAudience(
  tx: pg.PoolClient,
  event: Pick<RoutedEvent, 'payload' | 'tripId'>,
): Promise<readonly string[]> {
  const tripId = str(event, 'trip_id') ?? event.tripId;
  const endsAt = new Date(str(event, 'ends_at') ?? '');
  if (tripId === null || Number.isNaN(endsAt.getTime())) return [];
  const boosted = await tx.query(
    `SELECT 1 FROM trip_boosts WHERE trip_id = $1 AND status IN ('scheduled', 'active')
        AND source <> 'first_trip_free' AND ends_at > $2`,
    [tripId, endsAt],
  );
  if ((boosted.rowCount ?? 0) > 0) return [];
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT tp.user_id FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = tp.user_id
                          AND m.status = 'active'
      WHERE tp.trip_id = $1 AND tp.rsvp NOT IN ('out', 'waitlisted')
      ORDER BY tp.created_at, tp.user_id`,
    [tripId],
  );
  const run: RunQuery = async <Row>(sql: string, values: readonly unknown[]) =>
    (await tx.query(sql, [...values])).rows as Row[];
  const afterClose = { now: () => new Date(endsAt.getTime() + 60_000) };
  const audience: string[] = [];
  for (const { user_id: uid } of rows) {
    const sources = (await Promise.all(BILLING_USER_LOADERS.map((load) => load(run, uid)))).flat();
    const kept = sources.filter((source) => !(source.kind === 'ftf' && source.tripId === tripId));
    if (!passPlus(kept, uid, afterClose)) audience.push(uid);
  }
  return audience;
}

export function composeFtfEnding(event: Pick<RoutedEvent, 'payload' | 'tripId'>, now: Date) {
  const tripId = str(event, 'trip_id') ?? event.tripId;
  const endsAt = new Date(str(event, 'ends_at') ?? '');
  if (tripId === null || Number.isNaN(endsAt.getTime()) || !ftfEndingDue(endsAt, now)) return null;
  return {
    title: BILLING_PUSH.ftfEndingTitle,
    body: BILLING_PUSH.ftfEndingBody,
    vars: { days: ftfDaysLeft(endsAt, now), date: formatResumeDate(endsAt) },
    sender: DEFAULT_SETUP_GUIDE,
    tripId,
    deepLink: firstTripEndingLink(tripId),
  };
}

export function registerFtfEndingPush(now: () => Date = () => new Date()): void {
  registerNotification({
    key: 'free_boost_ending',
    event: 'ftf.ending_soon',
    audience: ftfEndingAudience,
    compose: governedCompose(
      'ftf_ending',
      'push',
      (event) => str(event, 'trip_id') ?? event.tripId,
      (_tx, event) => Promise.resolve(composeFtfEnding(event, now())),
      now,
    ),
  });
}
