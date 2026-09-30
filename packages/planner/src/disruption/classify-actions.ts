/**
 * Turns a flight impact into the disruption's rows (3k-5) under the autonomy policy:
 * - a retime of items only the delayed travellers attend, free and reversible, runs on its own;
 * - a retime touching anyone else, a booking or a must-do waits for a yes (C41 decider);
 * - anything reaching a vendor is a draft needing a yes, and the retime behind it runs only once
 *   the vendor confirms (never "Made rebooked" before Made says so);
 * - a cancelled flight or missed connection is the traveller's to rebook: a link, never an action;
 * - leave-bys, the Live Activity, the briefing line and the "nothing changes for you" note are the
 *   guide's own derived data and always run.
 * Row ids are `<kind>:<target>` so a re-trigger can diff versions.
 */
import {
  decideAutonomy,
  DISRUPTION_ACTION_CLASS,
  neverAutonomous,
  type AutonomyDecision,
  type DisruptionAction,
  type DisruptionActionKind,
  type DisruptionDecider,
} from '@cp/domain';

import {
  localTime,
  type AffectedItem,
  type FlightChange,
  type FlightImpact,
} from './flight-impact';

export interface ClassifyContext {
  readonly now: Date;
  /** The trip is under way (`trips.status = 'in_trip'`). */
  readonly inTrip: boolean;
}

type Facts = Record<string, string | number>;

function row(
  kind: DisruptionActionKind,
  target: string,
  fields: Partial<DisruptionAction> & Pick<DisruptionAction, 'state' | 'label'>,
): DisruptionAction {
  const base: DisruptionAction = {
    id: `${kind}:${target}`,
    kind,
    class: DISRUPTION_ACTION_CLASS[kind],
    state: fields.state,
    autonomous: false,
    reversible: false,
    cost_delta_minor: 0,
    booking_impact: false,
    affected_user_ids: [],
    item_stable_id: null,
    provider_id: null,
    depends_on: null,
    facts: {},
    decider: null,
    guide_action_id: null,
    vendor_message_id: null,
    decided_by: null,
    label: fields.label,
  };
  const merged = { ...base, ...fields };
  // Belt and braces: a vendor or link row is never autonomous, whatever built it.
  return neverAutonomous(kind) ? { ...merged, autonomous: false } : merged;
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

function itemRows(
  entry: AffectedItem,
  change: FlightChange,
  impact: FlightImpact,
  ctx: ClassifyContext,
): DisruptionAction[] {
  const { item, attendees, newStart } = entry;
  const kind: DisruptionActionKind = item.role === 'pickup' ? 'reschedule_pickup' : 'retime_item';
  const from = localTime(item.startsAt, change.tz);
  const facts: Facts = { title: item.title, from };
  if (newStart !== null) facts['to'] = localTime(newStart, change.tz);
  const bookingImpact = item.bookingId !== null;
  const common = {
    affected_user_ids: [...attendees],
    item_stable_id: item.stableId,
    provider_id: item.providerId,
    booking_impact: bookingImpact,
  };
  const actionContext = { now: ctx.now, inTrip: ctx.inTrip, itemStarts: [item.startsAt] };
  // Who may say yes to a message to the vendor: never the guide alone.
  const askCrew = decideAutonomy(
    {
      kind,
      reversible: true,
      costDeltaMinor: 0,
      bookingImpact,
      affectedUserIds: attendees,
      requesterId: null,
      timeCritical: true,
    },
    actionContext,
  );

  if (item.providerId !== null && item.providerName !== null) {
    const vendorFacts: Facts = { ...facts, vendor: item.providerName };
    const vendorLabel =
      newStart === null
        ? `Tell ${item.providerName} the flight won't land today?`
        : item.role === 'pickup'
          ? `Ask ${item.providerName} to pick you up at ${String(facts['to'])}?`
          : `Tell ${item.providerName}: ${item.title} at ${String(facts['to'])}?`;
    const vendorRow = row('contact_vendor', item.stableId, {
      ...common,
      state: 'draft_ready',
      facts: vendorFacts,
      decider: deciderOf(askCrew),
      label: vendorLabel,
    });
    if (newStart === null) return [vendorRow];
    const retime = row(kind, item.stableId, {
      ...common,
      state: 'waiting_vendor',
      reversible: true,
      depends_on: vendorRow.id,
      facts,
      label: `${item.title} ${from} → ${String(facts['to'])}`,
    });
    return [vendorRow, retime];
  }
  if (newStart === null) return [];

  const decision = decideAutonomy(
    {
      kind,
      reversible: true,
      costDeltaMinor: 0,
      bookingImpact,
      affectedUserIds: attendees,
      requesterId: null,
      // A must-do or booked item is the crew's to move, never the guide's.
      ...(item.locked ? {} : { ownerIds: impact.travellerIds }),
      timeCritical: true,
    },
    actionContext,
  );
  return [
    row(kind, item.stableId, {
      ...common,
      state: decision.outcome === 'auto' ? 'planned' : 'needs_yes',
      autonomous: decision.outcome === 'auto',
      reversible: true,
      facts,
      decider: deciderOf(decision),
      label: `${item.title} ${from} → ${String(facts['to'])}`,
    }),
  ];
}

export function classifyFlightActions(
  change: FlightChange,
  impact: FlightImpact,
  ctx: ClassifyContext,
): DisruptionAction[] {
  if (!impact.material) return [];
  const rows: DisruptionAction[] = impact.affected.flatMap((entry) =>
    itemRows(entry, change, impact, ctx),
  );
  const travellers = [...impact.travellerIds];
  const system = (kind: DisruptionActionKind, label: string, facts: Facts = {}) =>
    row(kind, 'trip', {
      state: 'planned',
      autonomous: true,
      affected_user_ids: travellers,
      facts,
      label,
    });
  if (change.cause === 'cancelled' || change.cause === 'missed_connection') {
    rows.push(
      row('rebook_flight', change.segmentId, {
        state: 'link',
        affected_user_ids: travellers,
        facts: { carrier: change.carrier, flight: String(impact.facts['flight']) },
        label: `Rebook on ${change.carrier}`,
      }),
    );
  }
  rows.push(system('refresh_live_activity', 'Flight updated on your lock screen'));
  if (impact.leaveByStableIds.length > 0) {
    rows.push(
      system('recompute_leave_by', 'Leave-by times updated', {
        count: impact.leaveByStableIds.length,
      }),
    );
  }
  rows.push(system('insert_briefing', 'Added to your briefing'));
  if (impact.unaffected.length > 0) {
    rows.push(
      row('notify_unaffected', 'crew', {
        state: 'planned',
        autonomous: true,
        affected_user_ids: impact.unaffected.map((entry) => entry.userId),
        facts: { count: impact.unaffected.length },
        label: 'Told the others nothing changes for them',
      }),
    );
  }
  return rows;
}
