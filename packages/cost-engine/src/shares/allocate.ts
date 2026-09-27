/**
 * Exact per-person shares. Each member's share is their own flight, their slice of every shared
 * room and group component, and their own personal items, in integer minor units of the trip
 * currency. Shared totals are split with the largest-remainder allocator (ties by uid), so the
 * shares of a component always sum to exactly its total.
 */
import { allocate as allocateMoney } from '../money/allocate';
import { type CurrencyCode } from '../money/currencies';
import { isStaleComponent, type CostComponent, type CostComponentKind } from '../quotes/quote-set';
import { convertWith, type FxContext } from './fx';
import { applicableMembers, resolveOrigins, type CostMember } from './per-origin';

export interface ShareInput {
  /** The calc currency (the trip's currency); every line is converted into it. */
  readonly currency: CurrencyCode;
  readonly members: readonly CostMember[];
  readonly components: readonly CostComponent[];
  readonly fx?: FxContext;
  /** Staleness reference; without it nothing is flagged stale. */
  readonly now?: Date;
}

export interface ShareLine {
  readonly componentId: string;
  readonly kind: CostComponentKind;
  /** `null` = this component has no price yet. */
  readonly amountMinor: bigint | null;
}

export interface MemberShare {
  readonly uid: string;
  readonly currency: CurrencyCode;
  /** Sum of the priced lines; a lower bound when `missing`. */
  readonly totalMinor: bigint;
  readonly lines: readonly ShareLine[];
  /** Some line has no price (or no flight exists for the member's origin): show as "~". */
  readonly missing: boolean;
  /** The member's origin was taken from the crew majority. */
  readonly estimatedOrigin: boolean;
  /** Some line's price is older than 72 h. */
  readonly stale: boolean;
}

export type ShareCalc =
  | {
      readonly status: 'no_participants';
      readonly currency: CurrencyCode;
      readonly fxSnapshotId: string | null;
    }
  | {
      readonly status: 'ok';
      readonly currency: CurrencyCode;
      readonly fxSnapshotId: string | null;
      readonly members: readonly MemberShare[];
      /** Σ member totals = Σ priced, assigned component totals, exactly. */
      readonly totalMinor: bigint;
      /** Components that apply to nobody (e.g. a fare for an origin nobody flies from). */
      readonly unassigned: readonly string[];
    };

interface MemberAccumulator {
  lines: ShareLine[];
  missing: boolean;
  stale: boolean;
}

export function computeShares(input: ShareInput): ShareCalc {
  const fxSnapshotId = input.fx?.snapshotId ?? null;
  if (input.members.length === 0) {
    return { status: 'no_participants', currency: input.currency, fxSnapshotId };
  }
  const members = resolveOrigins(input.members);
  const acc = new Map<string, MemberAccumulator>(
    members.map((m) => [m.uid, { lines: [], missing: false, stale: false }]),
  );
  const flightCovered = new Set<string>();
  const hasFlights = input.components.some((c) => c.kind === 'flight');
  const unassigned: string[] = [];

  for (const component of input.components) {
    const payers = applicableMembers(component, members);
    if (payers.length === 0) {
      unassigned.push(component.id);
      continue;
    }
    const stale = input.now !== undefined && isStaleComponent(component, input.now);
    const amounts = splitComponent(
      component,
      payers.map((p) => p.uid),
      input,
    );
    for (const payer of payers) {
      const entry = acc.get(payer.uid) as MemberAccumulator;
      const amountMinor = amounts === null ? null : (amounts.get(payer.uid) ?? 0n);
      entry.lines.push({ componentId: component.id, kind: component.kind, amountMinor });
      entry.missing ||= amountMinor === null;
      entry.stale ||= stale;
      if (component.kind === 'flight') flightCovered.add(payer.uid);
    }
  }

  const shares: MemberShare[] = members.map((member) => {
    const entry = acc.get(member.uid) as MemberAccumulator;
    const totalMinor = entry.lines.reduce((sum, line) => sum + (line.amountMinor ?? 0n), 0n);
    return {
      uid: member.uid,
      currency: input.currency,
      totalMinor,
      lines: entry.lines,
      missing: entry.missing || (hasFlights && !flightCovered.has(member.uid)),
      estimatedOrigin: member.estimatedOrigin,
      stale: entry.stale,
    };
  });
  return {
    status: 'ok',
    currency: input.currency,
    fxSnapshotId,
    members: shares,
    totalMinor: shares.reduce((sum, share) => sum + share.totalMinor, 0n),
    unassigned,
  };
}

/** Per-payer amounts in the calc currency, or `null` when the component has no price. */
function splitComponent(
  component: CostComponent,
  payerIds: readonly string[],
  input: ShareInput,
): ReadonlyMap<string, bigint> | null {
  if (component.amountMinor === null) return null;
  const amount = convertWith(
    { amountMinor: component.amountMinor, currency: component.currency },
    input.currency,
    input.fx,
  );
  if (component.unit === 'person') {
    return new Map(payerIds.map((uid) => [uid, amount.amountMinor]));
  }
  const parts = allocateMoney(
    amount,
    payerIds.map((id) => ({ id, weight: 1n })),
  );
  return new Map(parts.map((part) => [part.id, part.amount.amountMinor]));
}

/** The share of one member, or `undefined` when the calc has no such member. */
export function shareOf(calc: ShareCalc, uid: string): MemberShare | undefined {
  return calc.status === 'ok' ? calc.members.find((m) => m.uid === uid) : undefined;
}
