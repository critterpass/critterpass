/**
 * Whether a journey check is due (pure; the hook in ./use-journey-check.ts runs it once a minute):
 * the leave-by window of a plan item the member is on, on a trip under way, switched on, and a
 * fresh fix the location engine already had.
 */
import type { JourneyMode } from '@cp/domain';

import type { EngineFix } from '@/lib/location/ports';

const MIN = 60_000;
export const JOURNEY_CHECK_EVERY_MS = MIN;
/** A fix older than this says nothing about where the member is now. */
const FIX_FRESH_MS = 2 * MIN;

export interface JourneyRow {
  readonly id: string;
  readonly trip_id: string;
  readonly plan_item_id: string | null;
  readonly leave_at: string;
  readonly starts_at: string;
  readonly legs: string | null;
  readonly participant_ids: string | null;
}

export interface Journey {
  readonly tripId: string;
  readonly itemId: string;
  readonly mode: JourneyMode;
}

function list(text: string | null): unknown[] {
  if (text === null) return [];
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** How the member travels, from the leave-by's first leg. */
export function journeyMode(legsJson: string | null): JourneyMode {
  const leg = list(legsJson)[0] as { kind?: unknown; mode?: unknown } | undefined;
  if (leg?.kind === 'pickup') return 'transfer';
  if (leg?.mode === 'pedestrian' || leg?.mode === 'walk') return 'walk';
  if (leg?.mode === 'motor_scooter' || leg?.mode === 'scooter') return 'scooter';
  return 'drive';
}

/** The journey under way right now for `me`, if any: the earliest leave-by already due. */
export function activeJourney(
  rows: readonly JourneyRow[],
  me: string | null,
  now: Date,
): Journey | null {
  if (me === null) return null;
  for (const row of rows) {
    if (row.plan_item_id === null) continue;
    const participants = list(row.participant_ids);
    if (participants.length > 0 && !participants.includes(me)) continue;
    const leaveAt = Date.parse(row.leave_at);
    const startsAt = Date.parse(row.starts_at);
    // The leave-by window: from the time to leave until the item starts.
    if (now.getTime() < leaveAt || now.getTime() >= startsAt) continue;
    return { tripId: row.trip_id, itemId: row.plan_item_id, mode: journeyMode(row.legs) };
  }
  return null;
}

export interface CheckInputs {
  readonly enabled: boolean;
  readonly journey: Journey | null;
  readonly fix: EngineFix | null;
  readonly engineRunning: boolean;
  readonly now: Date;
}

/** Whether a check goes out now: switched on, a journey due, and a fresh fix the engine already had. */
export function checkDue(inputs: CheckInputs): inputs is CheckInputs & {
  journey: Journey;
  fix: EngineFix;
} {
  return (
    inputs.enabled &&
    inputs.engineRunning &&
    inputs.journey !== null &&
    inputs.fix !== null &&
    inputs.now.getTime() - inputs.fix.at <= FIX_FRESH_MS
  );
}
