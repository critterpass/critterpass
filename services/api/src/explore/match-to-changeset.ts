/**
 * A swipe match flies into the plan as a suggestion (docs/product-decisions.md §7 group swiping):
 * the slot finder picks a day and time for the place, and a `proposed` ChangeSet with that one
 * `add` waits for the organiser (`apply_changeset`), never applied by the match itself. A trip with
 * no plan yet, a place already in it, or no free slot leaves the match unslotted.
 */
import { appendDomainEvent } from '@cp/db';
import {
  changeSetOpsSchema,
  changeSetOpsToEdits,
  generateStableId,
  knownHours,
  MATCH_INSERTED_RT,
  PLAN_RT,
  type ChangeSetOp,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { publishPlan } from '../plan/changeset-store';
import { loadPlanState, lockTripPlan, replay } from '../plan/versioning';
import { readCrowds } from '../travel-data/crowds-route';
import { loadSlotDays, placeFacts } from './plan-read';
import { DEFAULT_VISIT_MIN, suggestSlot } from './slot-suggest';

export interface MatchSlot {
  readonly change_set_id: string | null;
  readonly day_no: number | null;
}

interface MatchInput {
  readonly matchId: string;
  readonly sessionId: string;
  readonly tripId: string;
  readonly poiId: string;
  readonly userIds: readonly string[];
  readonly startedBy: string;
}

/** Runs as the server inside the vote transaction that made the match. */
export async function matchToChangeSet(tx: pg.PoolClient, input: MatchInput): Promise<MatchSlot> {
  return asSystemRole(tx, async () => {
    const head = await lockTripPlan(tx, input.tripId);
    if (head.currentVersionId === null) return { change_set_id: null, day_no: null };
    const { rows } = await tx.query<{ tz: string | null; guide_id: string | null }>(
      `SELECT coalesce(t.tz, d.tz) AS tz, t.guide_id
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [input.tripId],
    );
    const place = await placeFacts(tx, input.poiId);
    const tz = rows[0]?.tz ?? place.tz ?? 'UTC';
    const plan = await loadSlotDays(
      tx,
      { current_version_id: head.currentVersionId },
      input.poiId,
      tz,
    );
    if (plan.inPlan !== null) return { change_set_id: null, day_no: plan.inPlan.day_no };
    const crowd =
      plan.firstDate === null ? null : await readCrowds(tx, input.poiId, plan.firstDate);
    const slot = suggestSlot({
      days: plan.days,
      tz,
      hours: knownHours(place.hours),
      quietStart: crowd?.best_window?.start ?? null,
      durationMin: place.timeNeededMin ?? DEFAULT_VISIT_MIN,
    });
    if (slot === null) return { change_set_id: null, day_no: null };
    const { rows: category } = await tx.query<{ category: string }>(
      'SELECT category FROM pois WHERE id = $1',
      [input.poiId],
    );
    const ops: ChangeSetOp[] = changeSetOpsSchema.parse([
      {
        op: 'add',
        target: generateStableId(),
        after: {
          day_no: slot.day_no,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          tz,
          poi_id: input.poiId,
          category: category[0]?.category ?? 'other',
          attendee_ids: [...input.userIds],
        },
        reason: 'swipe_match',
        affected_user_ids: [...input.userIds],
        booking_impact: false,
        source_ids: [`swipe_match:${input.matchId}`],
      },
    ]);
    replay(await loadPlanState(tx, head.currentVersionId), changeSetOpsToEdits(ops));
    const guide = rows[0]?.guide_id ?? null;
    const { rows: sets } = await tx.query<{ id: string }>(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops)
       VALUES ($1, $2, 'manual', $3, $4, 'draft', $5) RETURNING id`,
      [
        input.tripId,
        head.currentVersionId,
        guide === null ? 'user' : 'guide',
        guide ?? input.startedBy,
        JSON.stringify(ops),
      ],
    );
    const changeSetId = sets[0]?.id ?? null;
    if (changeSetId === null) throw new Error('change_sets insert returned no id');
    // A change set is born a draft; the suggestion is proposed to the organiser at once.
    await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
    await appendDomainEvent(tx, {
      type: 'change_set.created',
      aggregateKind: 'change_set',
      aggregateId: changeSetId,
      actorKind: 'system',
      actorId: null,
      crewId: head.crewId,
      tripId: input.tripId,
      payload: { trip_id: input.tripId, change_set_id: changeSetId, source: 'guide_suggestion' },
    });
    await publishPlan(tx, input.tripId, PLAN_RT.changesetCreated, {
      change_set_id: changeSetId,
      author_id: guide ?? input.startedBy,
      trigger: 'manual',
    });
    await publishPlan(tx, input.tripId, MATCH_INSERTED_RT, {
      match_id: input.matchId,
      session_id: input.sessionId,
      poi_id: input.poiId,
      change_set_id: changeSetId,
      day_no: slot.day_no,
    });
    return { change_set_id: changeSetId, day_no: slot.day_no };
  });
}
