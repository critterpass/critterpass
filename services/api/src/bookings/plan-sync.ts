/**
 * Keeping the plan in step with the wallet (docs/api-contracts.md §4.10): after a booking is
 * added, edited, deleted, shared or taken back, the trip's working plan holds exactly the anchored
 * items its bookings call for (`bookedPlanItems` in `@cp/db` says which, and what the crew may
 * see). A trip with a current plan gets a new plan version through the one versioning path, so the
 * crew is told, costs are re-priced and leave-bys recomputed exactly as for an organiser's edit.
 * A trip still in draft review has no version protocol yet (direct edits answer `no_plan`, and a
 * proposal being built and a running redraft both hold the draft's id), so its draft is brought in
 * line in place; that same version is what sending or locking in publishes. Nothing changes when
 * the plan already matches, so repeating a command adds nothing.
 */
import {
  bookedPlanItems,
  isBookedPlanItem,
  writeBookedPlanItems,
  type BookedPlanItem,
} from '@cp/db';
import type { PlanEdit, PlanState, PlanStateItem } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { commitPlanVersion, loadPlanState, replay, type TripPlanHead } from '../plan/versioning';

function booked(item: BookedPlanItem): Partial<PlanStateItem> {
  return {
    day_no: item.day_no,
    booking_id: item.booking_id,
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    tz: item.tz,
    attendee_ids: item.attendee_ids,
    category: item.category,
    notes: item.notes,
    status: 'confirmed',
    locked_reason: 'booking',
  };
}

function instant(at: string | undefined): number | null {
  return at === undefined ? null : Date.parse(at);
}

function matches(have: PlanStateItem, want: BookedPlanItem): boolean {
  return (
    have.day_no === want.day_no &&
    have.booking_id === want.booking_id &&
    instant(have.starts_at) === instant(want.starts_at) &&
    instant(have.ends_at) === instant(want.ends_at) &&
    have.tz === want.tz &&
    (have.attendee_ids ?? []).join() === want.attendee_ids.join() &&
    have.category === want.category &&
    have.notes === want.notes &&
    have.status === 'confirmed' &&
    have.locked_reason === 'booking'
  );
}

/** The edits that leave `state` holding exactly `wanted` as its booked items. */
export function bookedItemEdits(state: PlanState, wanted: readonly BookedPlanItem[]): PlanEdit[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const keep = new Set(wanted.map((item) => item.stable_id));
  const edits: PlanEdit[] = [];
  for (const item of state.items) {
    if (isBookedPlanItem(item) && !keep.has(item.stable_id)) {
      edits.push({ kind: 'remove', stableId: item.stable_id });
    }
  }
  for (const want of wanted) {
    const have = byId.get(want.stable_id);
    if (have === undefined) {
      edits.push({
        kind: 'add',
        item: {
          ...booked(want),
          stable_id: want.stable_id,
          day_no: want.day_no,
          created_by_kind: 'user',
        },
      });
    } else if (!matches(have, want)) {
      edits.push({ kind: 'patch', stableId: want.stable_id, patch: booked(want) });
    }
  }
  return edits;
}

interface TripPlanRow {
  readonly crew_id: string;
  readonly status: string;
  readonly current_version_id: string | null;
  readonly draft_version_id: string | null;
}

/**
 * Brings the trip's working plan in line with its bookings, under the trip's plan lock; resolves to
 * the new plan version when the current plan changed, otherwise null.
 */
export async function syncBookedPlanItems(
  tx: pg.PoolClient,
  tripId: string,
  actorId: string,
): Promise<string | null> {
  const trip = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<TripPlanRow>(
      `SELECT crew_id, status, current_version_id, draft_version_id FROM trips
        WHERE id = $1 FOR UPDATE`,
      [tripId],
    );
    return rows[0];
  });
  if (trip === undefined) return null;
  const current = trip.current_version_id;
  const draft = trip.draft_version_id;
  // The plan the organiser is working on: the draft while it is in review, the trip's plan after.
  const working = trip.status === 'draft_review' ? (draft ?? current) : (current ?? draft);
  if (working === null) return null;
  if (current === null || working !== current) {
    await asSystemRole(tx, () => writeBookedPlanItems(tx, tripId, working));
    return null;
  }
  const state = await loadPlanState(tx, current);
  const wanted = await asSystemRole(tx, () => bookedPlanItems(tx, tripId, current));
  const edits = bookedItemEdits(state, wanted);
  if (edits.length === 0) return null;
  const head: TripPlanHead = { tripId, crewId: trip.crew_id, currentVersionId: current };
  return commitPlanVersion(tx, {
    head,
    baseVersionId: current,
    next: replay(state, edits),
    actor: { kind: 'user', id: actorId },
    source: 'ops',
    opCount: edits.length,
    // The crew reads the new version through sync: a plan op cannot carry a booking's lock.
    ops: null,
  });
}
