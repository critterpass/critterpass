/**
 * The drafting screen's live rows: each job step says when it starts and, when it finishes, what
 * it actually found (`DraftStepLabel`: a key plus numbers and names, never an availability, a price
 * or a cancellation claim). Day themes stream as the outline lands and again as each day is built,
 * and `draft.done` closes the job. All of them are hints on `trip_draft:{trip_id}`; the draft
 * itself arrives through sync.
 */
import type { SkeletonPlan } from '@cp/ai';
import { outbox, withSystem } from '@cp/db';
import {
  channelName,
  DRAFT_RT,
  type DraftDayTitleHint,
  type DraftDoneHint,
  type DraftStepHint,
  type DraftStepLabel,
} from '@cp/domain';
import type pg from 'pg';

import type { DraftTripData } from './load';

export function draftChannel(tripId: string): string {
  return channelName('trip_draft', tripId);
}

export function publishStep(pool: pg.Pool, tripId: string, hint: DraftStepHint): Promise<unknown> {
  return withSystem(pool, (tx) => outbox(tx, draftChannel(tripId), DRAFT_RT.step, hint));
}

export function publishDayTitle(
  pool: pg.Pool,
  tripId: string,
  hint: DraftDayTitleHint,
): Promise<unknown> {
  return withSystem(pool, (tx) => outbox(tx, draftChannel(tripId), DRAFT_RT.dayTitle, hint));
}

export function publishDone(
  tx: pg.PoolClient,
  tripId: string,
  hint: DraftDoneHint,
): Promise<unknown> {
  return outbox(tx, draftChannel(tripId), DRAFT_RT.done, hint);
}

const label = (
  key: DraftStepLabel['key'],
  params: DraftStepLabel['params'] = {},
): DraftStepLabel => ({
  key,
  params,
});

/** "Read {n} taste profiles": members whose taste profile the crew can see. */
export function readProfilesLabel(trip: DraftTripData): DraftStepLabel {
  return label('read_profiles', { n: trip.members.filter((m) => m.tastes.length > 0).length });
}

/** "Checked the {signal}" (a reviewed season event or the month's highlight), else the season. */
export function seasonLabel(signal: string | null): DraftStepLabel {
  return signal === null ? label('season_none') : label('season', { signal });
}

/** "Picked {n} {stay_type}s in {area}" for the stays setup chose, else "Planned {n} days". */
export function staysLabel(trip: DraftTripData, skeleton: SkeletonPlan): DraftStepLabel {
  const stays = trip.rooms?.stays ?? [];
  const first = stays[0];
  if (first === undefined) return label('days_planned', { n: skeleton.days.length });
  return label('stays', {
    n: stays.length,
    stay_type: first.stayType.replaceAll('_', ' '),
    area: skeleton.stayArea,
  });
}

/** "Balancing {early} early birds and {late} night owls", else "Setting the pace". */
export function balanceLabel(trip: DraftTripData): DraftStepLabel {
  const early = trip.members.filter((m) => m.tastes.includes('early_starts')).length;
  const late = trip.members.filter((m) => m.tastes.includes('late_starts')).length;
  return early + late === 0 ? label('pace') : label('balance', { early, late });
}

/** "Finding {dietary} {food} for {name}" when a diet shapes the meals, else "Checking opening hours". */
export function foodLabel(trip: DraftTripData): DraftStepLabel {
  const first = trip.dietsBy[0];
  return first === undefined
    ? label('hours')
    : label('food', { dietary: first.diet, food: 'food', name: first.name });
}

export function savedLabel(): DraftStepLabel {
  return label('saved');
}
