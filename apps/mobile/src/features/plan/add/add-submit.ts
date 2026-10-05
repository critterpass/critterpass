/**
 * What ADD sends: the place as a new stop (or, already planned, its stop moved), the stops the add
 * pushes later, and which those are, so taking the new stop off later can put them back exactly.
 */
import type { PlanOp, PlanPush, PlanState } from '@cp/domain';

import { pushOf } from '@/data/plan/plan-pushes';

import { addOps, moveStopOps, type AddChoice, type AddDay, type NearbyAdd } from './add-model';
import type { PlacedStop } from './placed-stop';
import type { AddSubject } from './use-add-subject';

export function addSubmission(input: {
  readonly choice: AddChoice;
  readonly day: AddDay;
  readonly tz: string;
  readonly subject: AddSubject;
  readonly existing: PlacedStop | null;
  readonly lengthMin: number;
  /** Who goes; empty = the whole crew. */
  readonly attendeeIds: readonly string[];
  readonly nearby: NearbyAdd | null;
  readonly stableIds: readonly [string, string];
  readonly pushes: readonly PlanOp[];
  readonly state: PlanState;
}): { readonly ops: PlanOp[]; readonly pushed: PlanPush | undefined } {
  const { choice, day, tz, subject } = input;
  const own =
    input.existing !== null
      ? moveStopOps(input.existing.stableId, choice, day, tz, input.lengthMin)
      : addOps({
          choice,
          day,
          tz,
          place: {
            poiId: subject.poiId,
            name: subject.name,
            category: subject.category,
            pin: { lat: subject.lat, lng: subject.lng },
          },
          lengthMin: input.lengthMin,
          attendeeIds: input.attendeeIds,
          nearby: input.nearby,
          stableIds: input.stableIds,
        });
  const cause = input.existing?.stableId ?? input.stableIds[0];
  return {
    ops: [...own, ...input.pushes],
    pushed: pushOf(cause, input.pushes, input.state),
  };
}
