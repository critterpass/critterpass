/**
 * The rows a chosen running-late option becomes (3k-9), under the autonomy policy:
 * - WALK THE LAST BIT and CALL A CAR change nothing in the plan, and neither does a split PUSH or
 *   SKIP: the others carry on as planned.
 * - A message to whoever runs the item is only ever a draft needing a yes, and a retime that needs
 *   their answer waits for it ("KARSA SAID YES" only once Karsa did).
 * - A late member's pick is their own yes where the policy lets any one of them decide (their own
 *   item; in-trip and time-critical). Anything else still goes to the crew decider.
 * - A booked item is never moved or taken off the plan here: its time follows its booking, and its
 *   booker cancels it with the supplier.
 */
import {
  decideAutonomy,
  DISRUPTION_ACTION_CLASS,
  joinNames,
  type AutonomyDecision,
  type DisruptionAction,
  type DisruptionActionKind,
  type DisruptionDecider,
  type LateOption,
} from '@cp/domain';

import { localTime } from './flight-impact';
import type { LateInput } from './late-options';

export interface LateChoiceContext {
  readonly now: Date;
  readonly inTrip: boolean;
  /** The late member who picked the option: their pick is their yes. */
  readonly chooserId: string;
  readonly itemStableId: string;
  readonly providerId: string | null;
  /** The item is a booking or a must-do: the crew's to move, never one member's. */
  readonly locked: boolean;
  readonly names: readonly string[];
}

function row(
  kind: DisruptionActionKind,
  target: string,
  fields: Partial<DisruptionAction> & Pick<DisruptionAction, 'state' | 'label'>,
): DisruptionAction {
  return {
    id: `${kind}:${target}`,
    kind,
    class: DISRUPTION_ACTION_CLASS[kind],
    autonomous: false,
    reversible: false,
    cost_delta_minor: 0,
    booking_impact: false,
    affected_user_ids: [],
    item_stable_id: null,
    provider_id: null,
    starts_at: null,
    depends_on: null,
    facts: {},
    decider: null,
    poll: null,
    guide_action_id: null,
    vendor_message_id: null,
    decided_by: null,
    ...fields,
  };
}

function deciderOf(decision: AutonomyDecision): DisruptionDecider | null {
  if (decision.outcome !== 'needs_yes') return null;
  return {
    policy: decision.decider_policy,
    threshold: decision.threshold,
    tie_breaker: decision.tie_breaker,
    closes_at: decision.closes_at,
  };
}

/** One late member's pick settles a row only where the policy lets any one of them decide. */
function settledByChooser(decision: AutonomyDecision): boolean {
  return (
    decision.outcome === 'needs_yes' &&
    (decision.decider_policy === 'any_affected' || decision.decider_policy === 'self')
  );
}

export function lateChoiceRows(
  input: LateInput,
  option: LateOption,
  ctx: LateChoiceContext,
): DisruptionAction[] {
  if (option.id === 'walk' || option.id === 'car') return [];
  const party = [...input.latePartyIds].sort();
  const who = joinNames(ctx.names);
  const from = localTime(input.startsAt, input.tz);
  const to = option.new_start === null ? null : localTime(new Date(option.new_start), input.tz);
  const policyContext = { now: ctx.now, inTrip: ctx.inTrip, itemStarts: [input.startsAt] };
  const common = {
    affected_user_ids: party,
    item_stable_id: ctx.itemStableId,
    provider_id: ctx.providerId,
  };
  const rows: DisruptionAction[] = [];

  let message: DisruptionAction | null = null;
  if (ctx.providerId !== null && input.vendorName !== null) {
    // A message to whoever runs the item is never the guide's alone to send.
    const ask = decideAutonomy(
      {
        kind: 'retime_item',
        reversible: false,
        costDeltaMinor: 0,
        bookingImpact: false,
        affectedUserIds: party,
        requesterId: null,
        timeCritical: true,
      },
      policyContext,
    );
    const facts = {
      vendor: input.vendorName,
      title: input.title,
      from,
      names: who,
      minutes: input.lateMin,
      why: option.id === 'skip' ? 'late_skip' : option.split ? 'late_join' : 'late_push',
      ...(to === null ? {} : { to }),
    };
    message = row('contact_vendor', ctx.itemStableId, {
      ...common,
      state: 'draft_ready',
      facts,
      decider: deciderOf(ask),
      label:
        option.id === 'skip'
          ? `Tell ${input.vendorName} you can't make ${input.title}?`
          : option.split
            ? `Tell ${input.vendorName}: ${who} at ${String(to)}?`
            : `Ask ${input.vendorName} to start at ${String(to)}?`,
    });
    rows.push(message);
  }
  // The others carry on as planned; and a booked item's time and place on the plan follow its
  // booking, so nothing here moves or removes it.
  if (option.split || input.anchored) return rows;

  if (option.id === 'push' && option.new_start !== null) {
    const facts = { title: input.title, from, to: String(to) };
    const label = `${input.title} ${from} → ${String(to)}`;
    if (message !== null) {
      rows.push(
        row('retime_item', ctx.itemStableId, {
          ...common,
          state: 'waiting_vendor',
          reversible: true,
          starts_at: option.new_start,
          depends_on: message.id,
          facts,
          label,
        }),
      );
      return rows;
    }
    const decision = decideAutonomy(
      {
        kind: 'retime_item',
        reversible: true,
        costDeltaMinor: 0,
        bookingImpact: false,
        affectedUserIds: party,
        requesterId: null,
        ...(ctx.locked ? {} : { ownerIds: party }),
        timeCritical: true,
      },
      policyContext,
    );
    const settled = settledByChooser(decision);
    rows.push(
      row('retime_item', ctx.itemStableId, {
        ...common,
        state: decision.outcome === 'auto' ? 'planned' : settled ? 'approved' : 'needs_yes',
        autonomous: decision.outcome === 'auto',
        reversible: true,
        starts_at: option.new_start,
        facts,
        decider: settled ? null : deciderOf(decision),
        decided_by: settled ? ctx.chooserId : null,
        label,
      }),
    );
    return rows;
  }
  if (option.id === 'skip') {
    // Taking an item off the plan cannot be undone, so it is never the guide's own call.
    const decision = decideAutonomy(
      {
        kind: 'remove_item',
        reversible: false,
        costDeltaMinor: 0,
        bookingImpact: false,
        affectedUserIds: party,
        requesterId: null,
        ...(ctx.locked ? {} : { ownerIds: party }),
        timeCritical: true,
      },
      policyContext,
    );
    const settled = settledByChooser(decision);
    rows.push(
      row('skip_item', ctx.itemStableId, {
        ...common,
        state: settled ? 'approved' : 'needs_yes',
        facts: { title: input.title },
        decider: settled ? null : deciderOf(decision),
        decided_by: settled ? ctx.chooserId : null,
        label: `${input.title} off the plan`,
      }),
    );
  }
  return rows;
}
