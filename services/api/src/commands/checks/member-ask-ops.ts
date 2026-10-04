/**
 * The ops an ask about one member's saves would make: each save placed where it fits well without
 * moving anything (a good day with no stop to move), one after the other so two saves never take
 * the same time. Each op's reason is the place's name, never anything about who was behind.
 */
import { DomainError, generateStableId, type ChangeSetOp } from '@cp/domain';
import { fitPlace, type FitContext, type FitItem } from '@cp/planner';
import type pg from 'pg';

import type { LoadedCheckInput } from '../../planning/fixers/check-input';
import { readFitPlaces } from '../../planning/fit/signals/visit';

export interface AskedIdea {
  readonly id: string;
  readonly poi_id: string;
}

/** The member's own live saves in the trip among `ideaIds`; any other id is `NOT_FOUND`. */
export async function memberSaves(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly memberId: string;
    readonly ideaIds: readonly string[];
  },
): Promise<AskedIdea[]> {
  const { rows } = await tx.query<AskedIdea>(
    `SELECT id, poi_id FROM trip_ideas
      WHERE trip_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL AND poi_id IS NOT NULL
        AND $3::uuid = ANY(backer_ids)`,
    [input.tripId, input.ideaIds, input.memberId],
  );
  if (rows.length !== new Set(input.ideaIds).size) {
    throw new DomainError('NOT_FOUND', { reason: 'idea' });
  }
  return rows;
}

export async function opsForSaves(
  tx: pg.PoolClient,
  check: LoadedCheckInput,
  ideas: readonly AskedIdea[],
): Promise<ChangeSetOp[]> {
  const facts = await readFitPlaces(
    tx,
    check.trip.id,
    ideas.map((idea) => idea.poi_id),
    check.loaded.inPlan,
  );
  let context: FitContext = check.input.context;
  const ops: ChangeSetOp[] = [];
  for (const { place, row } of facts) {
    const fit = fitPlace(context, place);
    const day = fit.days.find(
      (entry) =>
        entry.grade === 'good' && entry.slot !== null && (entry.needs_move ?? null) === null,
    );
    if (day === undefined || day.slot === null) continue;
    const stableId = generateStableId();
    ops.push({
      op: 'add',
      target: stableId,
      after: {
        day_no: day.day_no,
        starts_at: day.slot.starts_at,
        ends_at: day.slot.ends_at,
        tz: context.tz,
        poi_id: place.poiId,
        category: place.category,
        attendee_ids: [],
      },
      reason: row.name,
      affected_user_ids: [...context.participants].sort(),
      booking_impact: false,
    });
    const added: FitItem = {
      stableId,
      poiId: place.poiId,
      category: place.category,
      startsAt: new Date(day.slot.starts_at),
      endsAt: new Date(day.slot.ends_at),
      attendeeIds: [],
      locked: false,
      outdoor: place.outdoor,
      point: place.point,
    };
    context = {
      ...context,
      days: context.days.map((entry) =>
        entry.dayId === day.day_id ? { ...entry, items: [...entry.items, added] } : entry,
      ),
    };
  }
  return ops;
}
