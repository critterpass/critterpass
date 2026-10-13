/**
 * The solo trips of the start scenarios: the Đà Nẵng trip of ./scenario-trip.ts for a crew of one,
 * set up the way a traveller on their own sets it up (dates, the budget locked in đồng, a plan of
 * editorial places) and locked in alone, with nothing spent and nothing booked, so the expenses
 * and bookings a flow adds are the only ones on the trip.
 *
 * - `under_way`: the trip is on today, started by its organiser;
 * - `pre_trip`: the trip is confirmed for later and the lifecycle sweep has already moved it to
 *   `pre_trip` (it does so at once for a trip that starts within fourteen days), so a landing can
 *   start it without waiting for the next sweep.
 */
import { moveTripStatus } from '@cp/db';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import { asSystemRole } from '../admin/command';
import { createLockBudgetTargetCommand } from '../commands/setup/lock-budget-target';
import { lockInPlanCommand } from '../commands/proposal/lock-in-plan';
import { startTripCommand } from '../commands/trips/start-trip';
import { playCommand, type SeedCaller } from './play-command';
import { createTrip, localDate, planByHand } from './scenario-trip';

/** ₫15,000,000: on the budget's ₫500,000 step, and above what a flow spends in a day. */
export const SOLO_BUDGET_MINOR = 15_000_000;

export interface SoloTripInput {
  readonly crewId: string;
  readonly stage: 'pre_trip' | 'under_way';
  /** Days from today (in Đà Nẵng) to the trip's first day. */
  readonly startsInDays: number;
}

/** Builds the solo trip in the caller's crew; returns its id. */
export async function buildSoloTrip(
  tx: pg.PoolClient,
  who: SeedCaller,
  input: SoloTripInput,
  redis: RateLimitRedisClient,
): Promise<string> {
  const tripId = await createTrip(tx, who, input.crewId);
  await planByHand(tx, who, tripId, localDate(who.now, input.startsInDays));
  await playCommand(
    tx,
    createLockBudgetTargetCommand({ redis }),
    { trip_id: tripId, target_minor: SOLO_BUDGET_MINOR },
    who,
  );
  // Nobody else is in the crew, so the plan is locked in without a proposal going out.
  await playCommand(tx, lockInPlanCommand, { trip_id: tripId }, who);
  if (input.stage === 'under_way') {
    await playCommand(tx, startTripCommand, { trip_id: tripId }, who);
  } else {
    await asSystemRole(tx, () =>
      moveTripStatus(tx, { tripId, from: 'confirmed', to: 'pre_trip', actor: { kind: 'system' } }),
    );
  }
  return tripId;
}
