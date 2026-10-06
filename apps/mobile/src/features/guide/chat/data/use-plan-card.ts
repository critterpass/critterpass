/**
 * A plan card's model (3j-1) from the plan area's change review: each change as what goes (with
 * its time) and what comes in, the same-for-everyone cost change ("+$22 each"), and where the
 * change set stands. A driver the crew is asked to pick has his own line, with his days and
 * terms. Times and prices come from the change set and the plan, never from the guide's words.
 */
import type { ChangeSetOpKind } from '@cp/domain';
import { useMemo } from 'react';

import type { DriverPick } from '@/features/drivers';
import { useChangeset, type ChangesetView } from '@/features/plan';

type ChangesetState = ChangesetView['state'];

export interface PlanSwapSide {
  readonly label: string;
  readonly time: string | null;
}

export interface PlanSwap {
  readonly target: string;
  readonly op: ChangeSetOpKind;
  readonly before: PlanSwapSide | null;
  readonly after: PlanSwapSide | null;
  readonly reason: string;
}

export interface PlanCardModel {
  readonly changesetId: string;
  readonly tripId: string;
  readonly state: ChangesetState;
  /** What each person's share moves by (minor units), when it is the same for everyone. */
  readonly eachMinor: number | null;
  readonly currency: string | null;
  readonly swaps: readonly PlanSwap[];
  /** The drivers the change set asks the crew to pick, each with his days and terms. */
  readonly driverPicks: readonly (DriverPick & { readonly target: string })[];
}

export function toPlanCard(changesetId: string, view: ChangesetView): PlanCardModel | null {
  if (view.status !== 'ready' || view.row === null) return null;
  return {
    changesetId,
    tripId: view.row.trip_id,
    state: view.state,
    eachMinor: view.numbers?.eachMinor ?? null,
    currency: view.numbers?.currency ?? null,
    swaps: view.cards
      .filter((card) => card.accepted)
      // A driver pick swaps no plan item: it has its own line (`driverPicks`).
      .flatMap((card) => {
        const { op } = card;
        if (op === 'assign_provider') return [];
        return [
          {
            target: card.target,
            op,
            before:
              card.before === null ? null : { label: card.before.label, time: card.before.time },
            after: card.after === null ? null : { label: card.after.label, time: card.after.time },
            reason: card.reason,
          },
        ];
      }),
    driverPicks: view.cards.flatMap((card) =>
      card.accepted && card.driverPick !== null
        ? [{ ...card.driverPick, target: card.target }]
        : [],
    ),
  };
}

export function usePlanCard(tripId: string | null, changesetId: string): PlanCardModel | null {
  const view = useChangeset(tripId, changesetId);
  return useMemo(() => toPlanCard(changesetId, view), [changesetId, view]);
}
