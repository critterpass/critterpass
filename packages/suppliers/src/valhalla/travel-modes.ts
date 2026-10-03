/**
 * How a leg between two stops is travelled, as the day plan shows it ("WALK · 20 MIN",
 * "CAR · 1H10", "Made drives · 1h10 each way"): walk when it is short on foot (at most
 * `routing.walk_max_m`, 1.2 km, and 15 minutes), with the crew's driver when one is assigned that
 * day, else by car. Car minutes are free-flow minutes × the destination's `drive_factor`, the
 * editorial correction for local traffic (1.0 unless the founder set one).
 */
import type { PlanningTravelResult } from './travel';

export type ChosenLegMode = 'walk' | 'drive' | 'driver';

export const WALK_MAX_M = 1200;
export const WALK_MAX_MINUTES = 15;

export interface LegModeInput {
  readonly walk: PlanningTravelResult;
  readonly drive: PlanningTravelResult;
  readonly driverAssigned: boolean;
  readonly driveFactor: number;
  readonly walkMaxM?: number;
}

export interface ChosenLeg {
  readonly mode: ChosenLegMode;
  readonly minutes: number;
  readonly meters: number;
  readonly source: PlanningTravelResult['source'];
  readonly approx: boolean;
}

export function isWalkable(walk: PlanningTravelResult, walkMaxM: number = WALK_MAX_M): boolean {
  return walk.meters <= walkMaxM && walk.minutes <= WALK_MAX_MINUTES;
}

export function chooseLegMode(input: LegModeInput): ChosenLeg {
  const { walk, drive } = input;
  if (isWalkable(walk, input.walkMaxM)) {
    return {
      mode: 'walk',
      minutes: walk.minutes,
      meters: walk.meters,
      source: walk.source,
      approx: walk.approx,
    };
  }
  const factor =
    Number.isFinite(input.driveFactor) && input.driveFactor > 0 ? input.driveFactor : 1;
  const minutes = drive.minutes === 0 ? 0 : Math.max(1, Math.round(drive.minutes * factor));
  return {
    mode: input.driverAssigned ? 'driver' : 'drive',
    minutes,
    meters: drive.meters,
    source: drive.source,
    approx: drive.approx,
  };
}
