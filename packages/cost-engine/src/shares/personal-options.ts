/**
 * Personal options ("Skip the Nara day and save $64", "Share the big room −$140"): what-ifs priced
 * for one viewer only. Every function here returns the viewer's own numbers and nothing about any
 * other member, so a private objection (3f-4) can never leak into the crew's view.
 */
import { DomainError } from '@cp/domain';

import { displayDelta, roundEach } from '../display/round';
import { type Money } from '../money/money';
import { applyCostOps, stateShares, type CostOp, type TripCostState } from './state';

export interface PersonalOption {
  readonly id: string;
  readonly label: string;
  readonly ops: readonly CostOp[];
  /** Members whose consent the option needs (a room swap names who you would share with). */
  readonly requires?: readonly string[];
}

export interface PersonalOptionDelta {
  readonly optionId: string;
  /** Exact change to the viewer's share (negative = saving). */
  readonly delta: Money;
  /** Label delta between the rounded before and after figures ("−$64"). */
  readonly displayDelta: Money;
  readonly requires: readonly string[];
}

export interface ViewerQuote {
  readonly share: Money;
  readonly displayShare: Money;
  readonly approximate: boolean;
}

export function viewerQuote(state: TripCostState, viewerUid: string): ViewerQuote {
  const calc = stateShares(state);
  const share = calc.status === 'ok' ? calc.members.find((m) => m.uid === viewerUid) : undefined;
  if (!share) throw new DomainError('NOT_FOUND', { reason: 'viewer_not_in_trip' });
  const amount = { amountMinor: share.totalMinor, currency: share.currency };
  return { share: amount, displayShare: roundEach(amount), approximate: share.missing };
}

/** Each option's effect on the viewer's share, priced on its own against the base state. */
export function personalOptionDeltas(
  state: TripCostState,
  viewerUid: string,
  options: readonly PersonalOption[],
): readonly PersonalOptionDelta[] {
  const before = viewerQuote(state, viewerUid).share;
  return options.map((option) => {
    const after = viewerQuote(applyCostOps(state, option.ops), viewerUid).share;
    return {
      optionId: option.id,
      delta: { amountMinor: after.amountMinor - before.amountMinor, currency: after.currency },
      displayDelta: displayDelta(before, after),
      requires: option.requires ?? [],
    };
  });
}

/** The viewer's share with the chosen options applied together ("I'm in at $1,170"). */
export function viewerShareWithOptions(
  state: TripCostState,
  viewerUid: string,
  options: readonly PersonalOption[],
  chosenIds: readonly string[],
): ViewerQuote {
  const chosen = new Set(chosenIds);
  const ops = options.filter((o) => chosen.has(o.id)).flatMap((o) => o.ops);
  return viewerQuote(applyCostOps(state, ops), viewerUid);
}
