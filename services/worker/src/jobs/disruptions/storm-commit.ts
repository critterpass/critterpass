/**
 * `storm.commit`: the crew's storm vote closed. KEEP (or a deadline nobody voted by) keeps the
 * plan. SWAP moves the two days in one ChangeSet and SKIP removes the item, each approved by the
 * vote and applied through the guide-actions executor. The supplier side is never faked:
 * - a Viator booking waits for its original booker to hold and pay the new date
 *   (`awaiting_booker_payment`; the api's `hold_storm_seats` and `book_activity`), and the old one
 *   is cancelled only after the new one is confirmed (the api's booking hook);
 * - an affiliate booking is changed on the partner's site (`change_on_partner`);
 * - skipping a Viator booking is the booker's cancel, refund per the quote (`booker_cancel`).
 * The watch row becomes SET.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { DISRUPTION_QUEUES, type ChangeSetOp } from '@cp/domain';
import { swapDayOps, type StormOption } from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { applyApprovedGuideAction, executeGuideAction, planGuideAction } from '../../guide-actions';

export type StoredStormOption = StormOption & {
  readonly poll_option_id: string;
  readonly swap_day: string | null;
  readonly supplier_move?: Record<string, unknown>;
};

const DAY_MS = 86_400_000;

interface DayItem {
  stable_id: string;
  starts_at: Date;
  ends_at: Date | null;
  attendee_ids: string[] | null;
  booking_id: string | null;
  day_no: number;
  local_date: string;
}

async function dayItems(tx: pg.PoolClient, tripId: string, date: string): Promise<DayItem[]> {
  const { rows } = await tx.query<DayItem>(
    `SELECT pi.stable_id, pi.starts_at, pi.ends_at, pi.attendee_ids, pi.booking_id, d.day_no,
            (pi.starts_at AT TIME ZONE coalesce(pi.tz, t.tz, dest.tz, 'UTC'))::date::text AS local_date
       FROM plan_items pi
       JOIN trips t ON t.id = pi.trip_id AND t.current_version_id = pi.version_id
       LEFT JOIN destinations dest ON dest.id = t.destination_id
       JOIN plan_days d ON d.id = pi.day_id
      WHERE t.id = $1 AND pi.starts_at IS NOT NULL
        AND (pi.starts_at AT TIME ZONE coalesce(pi.tz, t.tz, dest.tz, 'UTC'))::date = $2::date
      ORDER BY pi.starts_at`,
    [tripId, date],
  );
  return rows;
}

/** Plans one guide action for the ops and applies it on the crew's vote. */
async function applyByPoll(
  tx: pg.PoolClient,
  input: { tripId: string; guideId: string; disruptionId: string; pollId: string },
  kind: 'move_item' | 'remove_item',
  ops: ChangeSetOp[],
): Promise<void> {
  if (ops.length === 0) return;
  const planned = await planGuideAction(tx, {
    tripId: input.tripId,
    kind,
    ops,
    guideId: input.guideId,
    requesterId: null,
    trigger: 'weather',
    disruptionId: input.disruptionId,
  });
  const decided = await executeGuideAction(tx, planned.actionId);
  if (decided.status !== 'needs_approval') return;
  await tx.query(
    `UPDATE change_sets SET status = 'approved', approved_by_kind = 'vote', poll_id = $2
      WHERE id = $1 AND status IN ('proposed', 'voting')`,
    [planned.changeSetId, input.pollId],
  );
  await applyApprovedGuideAction(tx, planned.actionId);
}

export async function commitStorm(
  pool: pg.Pool,
  disruptionId: string,
): Promise<'kept' | 'swapped' | 'skipped' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      trip_id: string;
      crew_id: string;
      guide_id: string | null;
      status: string;
      options: StoredStormOption[];
      chosen_option_id: string | null;
      decision_poll_id: string;
      source_snapshot: { watch_item_id: string; day: string; order_id: string | null };
      affected: { item_stable_ids: string[] };
    }>(
      `SELECT d.id, d.trip_id, t.crew_id, t.guide_id, d.status, d.options, d.chosen_option_id,
              d.decision_poll_id, d.source_snapshot, d.affected
         FROM disruptions d JOIN trips t ON t.id = d.trip_id
        WHERE d.id = $1 AND d.kind = 'storm' FOR UPDATE OF d`,
      [disruptionId],
    );
    const storm = rows[0];
    if (storm === undefined || storm.status !== 'open') return 'gone';
    const chosen = storm.options.find((option) => option.id === storm.chosen_option_id);
    const input = {
      tripId: storm.trip_id,
      guideId: storm.guide_id ?? '',
      disruptionId,
      pollId: storm.decision_poll_id,
    };
    let outcome: 'kept' | 'swapped' | 'skipped' = 'kept';
    let supplierMove: Record<string, unknown> | null = null;
    if (chosen?.id === 'swap' && chosen.swap_day !== null && storm.guide_id !== null) {
      const stormy = await dayItems(tx, storm.trip_id, storm.source_snapshot.day);
      const calm = await dayItems(tx, storm.trip_id, chosen.swap_day);
      const daysApart = Math.round(
        (Date.parse(chosen.swap_day) - Date.parse(storm.source_snapshot.day)) / DAY_MS,
      );
      const toSwap = (items: DayItem[]) => ({
        dayNo: items[0]?.day_no ?? 0,
        items: items.map((item) => ({
          stableId: item.stable_id,
          startsAt: item.starts_at,
          endsAt: item.ends_at,
          attendeeIds: item.attendee_ids ?? [],
          bookingId: item.booking_id,
        })),
      });
      const ops = swapDayOps(
        toSwap(stormy),
        toSwap(calm),
        daysApart,
        storm.options[0]?.label ?? '',
      );
      await applyByPoll(tx, input, 'move_item', ops);
      outcome = 'swapped';
      if (chosen.supplier === 'viator_rebook' && storm.source_snapshot.order_id !== null) {
        supplierMove = {
          state: 'awaiting_booker_payment',
          old_order_id: storm.source_snapshot.order_id,
          new_date: chosen.swap_day,
        };
      } else if (chosen.supplier === 'partner_link') {
        supplierMove = { state: 'change_on_partner' };
      }
    } else if (chosen?.id === 'skip' && storm.guide_id !== null) {
      const ops: ChangeSetOp[] = storm.affected.item_stable_ids.map((stableId) => ({
        op: 'remove',
        target: stableId,
        reason: chosen.label,
        affected_user_ids: [],
        booking_impact: storm.source_snapshot.order_id !== null,
      }));
      await applyByPoll(tx, input, 'remove_item', ops);
      outcome = 'skipped';
      if (chosen.supplier === 'viator_cancel') {
        supplierMove = { state: 'booker_cancel', old_order_id: storm.source_snapshot.order_id };
      } else if (chosen.supplier === 'partner_link') {
        supplierMove = { state: 'change_on_partner' };
      }
    }
    const options = storm.options.map((option) =>
      option.id === chosen?.id && supplierMove !== null
        ? { ...option, supplier_move: supplierMove }
        : option,
    );
    const waiting = supplierMove?.['state'] === 'awaiting_booker_payment';
    await tx.query(
      `UPDATE disruptions SET options = $2, version = version + 1,
              status = CASE WHEN $3 THEN status ELSE 'resolved' END,
              resolved_at = CASE WHEN $3 THEN resolved_at ELSE now() END
        WHERE id = $1`,
      [disruptionId, JSON.stringify(options), waiting],
    );
    await tx.query(
      "UPDATE watch_items SET status = CASE WHEN $2 = 'kept' THEN status ELSE 'set' END WHERE id = $1",
      [storm.source_snapshot.watch_item_id, outcome],
    );
    await appendDomainEvent(tx, {
      type: 'storm.decided',
      aggregateKind: 'trip',
      aggregateId: storm.trip_id,
      actorKind: 'system',
      actorId: null,
      crewId: storm.crew_id,
      tripId: storm.trip_id,
      payload: {
        trip_id: storm.trip_id,
        disruption_id: disruptionId,
        poll_id: storm.decision_poll_id,
        option: chosen?.id ?? 'keep',
      },
    });
    return outcome;
  });
}

const commitSchema = z.object({ disruption_id: z.uuid() });

export function stormCommitJob(): JobDefinition<z.infer<typeof commitSchema>> {
  return defineJob({
    queue: DISRUPTION_QUEUES.stormCommit,
    schema: commitSchema,
    singletonKey: (data) => data.disruption_id,
    handler: async (data, ctx) => ({ outcome: await commitStorm(ctx.pool, data.disruption_id) }),
  });
}
