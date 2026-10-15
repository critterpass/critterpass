/**
 * The week-long trips of the start scenarios, the long real data the screens sweep lays out: a
 * seven-day Đà Nẵng trip ten days out, set up and locked in the way ./scenario-trip.ts builds its
 * trip, with two stops a day at the destination's editorial places that have no photos first and
 * the longest names next. The crew's long name makes a long forward address.
 *
 * - `week_crew`: a crew of five, four crewmates with long Vietnamese names seated after the lock;
 * - `week_solo`: a crew of one.
 */
import type pg from 'pg';

import { lockInPlanCommand } from '../commands/proposal/lock-in-plan';
import { playCommand, type SeedCaller } from './play-command';
import { addScenarioCrewmates } from './scenario-crew';
import { createTrip, localDate, planByHand } from './scenario-trip';

export const WEEK_DAYS = 7;
const STARTS_IN_DAYS = 10;

/**
 * Clearly fake people ("Demo" in their names, no sign-in), named as Vietnamese families name, as
 * long as a given name may be (24 characters).
 */
export const WEEK_CREWMATES = [
  'Nguyễn Phương Thảo Demo',
  'Trần Hoàng Bảo Ngọc Demo',
  'Lê Văn Quang Huy Demo',
  'Phạm Ngọc Minh Khuê Demo',
] as const;

export interface WeekTripInput {
  readonly crewId: string;
  readonly withCrew: boolean;
}

/** Builds the week in the caller's crew; returns its id. */
export async function buildWeekTrip(
  tx: pg.PoolClient,
  who: SeedCaller,
  input: WeekTripInput,
): Promise<string> {
  const tripId = await createTrip(tx, who, input.crewId);
  await planByHand(tx, who, tripId, localDate(who.now, STARTS_IN_DAYS), {
    days: WEEK_DAYS,
    order: 'long_names',
  });
  // Nobody else is in the crew yet, so the plan is locked in without a proposal going out.
  await playCommand(tx, lockInPlanCommand, { trip_id: tripId }, who);
  if (input.withCrew) await addScenarioCrewmates(tx, input.crewId, tripId, WEEK_CREWMATES);
  return tripId;
}
