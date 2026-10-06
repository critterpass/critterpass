/**
 * Taking another crew's plan (docs/api-contracts.md §4.16): ♡ keeps it in the traveller's saved
 * list; an organiser copies the whole plan or chosen days into the trip, and anyone else suggests
 * it to the organiser.
 *
 * A copy brings the plan's places into the trip's Ideas and starts the placing job, which fits
 * them into the trip's own days against its dates, opening hours, travel times and must-dos and
 * leaves the result as a draft change only the organiser sees. Placing is never a redraft. A trip
 * without a plan yet keeps the places in Ideas until it has one.
 */
import { appendDomainEvent } from '@cp/db';
import {
  copySharedPlanPayloadSchema,
  DomainError,
  sharedPlanIdPayloadSchema,
  sharedPlanProjectionSchema,
  suggestSharedPlanPayloadSchema,
  type CopySharedPlanResult,
  type SharedPlanProjection,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';
import { backIdea, poiForTrip } from '../ideas';
import { startIdeaPlacementCommand } from '../ideas/start-idea-placement';
import { postCrewLine } from './store';

async function publishedProjection(
  tx: pg.PoolClient,
  id: string,
): Promise<{ projection: SharedPlanProjection; tripId: string }> {
  const { rows } = await tx.query<{ projection: unknown; trip_id: string }>(
    "SELECT projection, trip_id FROM shared_plans WHERE id = $1 AND status = 'published'",
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'shared_plan' });
  return { projection: sharedPlanProjectionSchema.parse(row.projection), tripId: row.trip_id };
}

async function setSaved(tx: pg.PoolClient, uid: string, id: string, saved: boolean) {
  const { rowCount } = saved
    ? await tx.query(
        `INSERT INTO saved_items (user_id, kind, ref_id) VALUES ($1, 'plan', $2)
         ON CONFLICT (user_id, kind, ref_id) DO NOTHING`,
        [uid, id],
      )
    : await tx.query(
        "DELETE FROM saved_items WHERE user_id = $1 AND kind = 'plan' AND ref_id = $2",
        [uid, id],
      );
  if ((rowCount ?? 0) === 0) return;
  await tx.query(
    'UPDATE shared_plans SET saves_count = greatest(0, saves_count + $2) WHERE id = $1',
    [id, saved ? 1 : -1],
  );
  await appendDomainEvent(tx, {
    type: saved ? 'shared_plan.saved' : 'shared_plan.unsaved',
    aggregateKind: 'user',
    aggregateId: uid,
    actorKind: 'user',
    actorId: uid,
    payload: { shared_plan_id: id, user_id: uid },
  });
}

export const saveSharedPlanCommand = defineCommand({
  name: 'save_shared_plan',
  v: 1,
  schema: sharedPlanIdPayloadSchema,
  offline: true,
  authorize: async (tx, payload) => {
    await asSystemRole(tx, () => publishedProjection(tx, payload.shared_plan_id));
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await setSaved(tx, ctx.uid, payload.shared_plan_id, true);
      return { saved: true };
    }),
});

export const unsaveSharedPlanCommand = defineCommand({
  name: 'unsave_shared_plan',
  v: 1,
  schema: sharedPlanIdPayloadSchema,
  offline: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await setSaved(tx, ctx.uid, payload.shared_plan_id, false);
      return { saved: false };
    }),
});

function chosenDays(projection: SharedPlanProjection, days: readonly number[] | undefined) {
  if (days === undefined) return projection.days;
  const wanted = new Set(days);
  return projection.days.filter((day) => wanted.has(day.day_no));
}

async function crewOf(tx: pg.PoolClient, tripId: string): Promise<string> {
  const { rows } = await tx.query<{ crew_id: string }>('SELECT crew_id FROM trips WHERE id = $1', [
    tripId,
  ]);
  return rows[0]!.crew_id;
}

async function startPlacing(
  tx: pg.PoolClient,
  tripId: string,
  ideaIds: string[],
  ctx: Parameters<typeof startIdeaPlacementCommand.handle>[2],
): Promise<string | null> {
  if (ideaIds.length === 0) return null;
  try {
    const started = await startIdeaPlacementCommand.handle(
      tx,
      { trip_id: tripId, idea_ids: ideaIds },
      ctx,
    );
    return started.job_id;
  } catch (error) {
    // No plan yet, or the day's placing budget is spent: the places wait in Ideas.
    if (error instanceof DomainError && ['STATE_INVALID', 'RATE_LIMITED'].includes(error.code)) {
      return null;
    }
    throw error;
  }
}

export const copySharedPlanCommand = defineCommand({
  name: 'copy_shared_plan',
  v: 1,
  schema: copySharedPlanPayloadSchema,
  offline: false,
  authorize: async (tx, payload) => {
    const access = await requireTripMember(tx, payload.trip_id);
    if (!access.organiser) throw new DomainError('FORBIDDEN', { reason: 'not_organiser' });
  },
  handle: (tx, payload, ctx): Promise<CopySharedPlanResult> =>
    asSystemRole(tx, async () => {
      const { projection, tripId: sourceTrip } = await publishedProjection(
        tx,
        payload.shared_plan_id,
      );
      if (sourceTrip === payload.trip_id)
        throw new DomainError('FORBIDDEN', { reason: 'own_plan' });
      const days = chosenDays(projection, payload.days);
      const crewId = await crewOf(tx, payload.trip_id);
      const ideaIds: string[] = [];
      for (const place of days.flatMap((day) => day.places)) {
        try {
          const target = await poiForTrip(tx, payload.trip_id, place.poi_id);
          const backed = await backIdea(tx, {
            tripId: payload.trip_id,
            crewId,
            uid: ctx.uid,
            place: target,
            source: 'save',
          });
          if (!ideaIds.includes(backed.ideaId)) ideaIds.push(backed.ideaId);
        } catch (error) {
          // A place outside this trip's areas, or gone from the catalogue, is left behind.
          if (error instanceof DomainError && ['NOT_FOUND', 'VALIDATION'].includes(error.code)) {
            continue;
          }
          throw error;
        }
      }
      const dayNos = days.map((day) => day.day_no);
      await tx.query(
        'INSERT INTO shared_plan_copies (shared_plan_id, copied_by, trip_id, days) VALUES ($1, $2, $3, $4)',
        [payload.shared_plan_id, ctx.uid, payload.trip_id, dayNos],
      );
      await tx.query('UPDATE shared_plans SET copies_count = copies_count + 1 WHERE id = $1', [
        payload.shared_plan_id,
      ]);
      await appendDomainEvent(tx, {
        type: 'shared_plan.copied',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        crewId,
        payload: {
          shared_plan_id: payload.shared_plan_id,
          trip_id: payload.trip_id,
          user_id: ctx.uid,
          days: dayNos,
        },
      });
      const jobId = await startPlacing(tx, payload.trip_id, ideaIds, ctx);
      return { idea_ids: ideaIds, job_id: jobId, places: ideaIds.length };
    }),
});

/** A member who is not an organiser passes the plan on: a line in crew chat links to it. */
export const suggestSharedPlanCommand = defineCommand({
  name: 'suggest_shared_plan_to_organiser',
  v: 1,
  schema: suggestSharedPlanPayloadSchema,
  offline: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await publishedProjection(tx, payload.shared_plan_id);
      const crewId = await crewOf(tx, payload.trip_id);
      await postCrewLine(tx, crewId, 'shared_plan_suggested', payload.shared_plan_id);
      await appendDomainEvent(tx, {
        type: 'shared_plan.suggested',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        crewId,
        payload: {
          shared_plan_id: payload.shared_plan_id,
          trip_id: payload.trip_id,
          user_id: ctx.uid,
        },
      });
      return { suggested: true as const };
    }),
});
