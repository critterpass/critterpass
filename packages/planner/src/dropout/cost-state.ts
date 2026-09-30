/**
 * The priced trip as the cost engine sees it, rebuilt from the stored `cost_components` rows (the
 * recompute job is their only writer), plus the viewer's personal skip options: "Skip the Nara day
 * and save $64". Every number here comes from the engine; nothing is estimated in this module.
 */
import {
  assertCurrencyCode,
  personalOptionDeltas,
  type CostComponentKind,
  type CostMember,
  type CostSource,
  type CostUnit,
  type CurrencyCode,
  type FxContext,
  type PersonalOption,
  type TripCostState,
} from '@cp/cost-engine';

/** One `cost_components` row as read from the database. */
export interface CostComponentRow {
  readonly component_key: string;
  readonly kind: string;
  readonly unit: string;
  readonly member_ids: readonly string[] | null;
  readonly amount_minor: string | null;
  readonly currency: string;
  readonly source: string;
  readonly seen_at: Date | string;
  readonly origin: string | null;
  readonly label: string | null;
}

export interface CostStateInput {
  readonly currency: string;
  readonly members: readonly CostMember[];
  readonly rows: readonly CostComponentRow[];
  readonly fx?: FxContext;
}

export function costStateFromRows(input: CostStateInput): TripCostState {
  const currency: CurrencyCode = assertCurrencyCode(input.currency);
  return {
    currency,
    members: input.members,
    stays: [],
    ...(input.fx ? { fx: input.fx } : {}),
    components: input.rows.map((row) => ({
      id: row.component_key,
      kind: row.kind as CostComponentKind,
      unit: row.unit as CostUnit,
      amountMinor: row.amount_minor === null ? null : BigInt(row.amount_minor),
      currency: assertCurrencyCode(row.currency),
      source: row.source as CostSource,
      seenAt: new Date(row.seen_at).toISOString(),
      ...(row.origin ? { origin: row.origin } : {}),
      ...(row.member_ids ? { memberIds: row.member_ids } : {}),
      ...(row.label ? { label: row.label } : {}),
    })),
  };
}

/** Components a member can personally skip: priced activities and transfers they pay for. */
const SKIPPABLE: ReadonlySet<CostComponentKind> = new Set(['activity', 'transfer']);

export interface SkipOption {
  readonly id: string;
  readonly componentId: string;
  readonly label: string;
  /** Exact change to the viewer's share, minor units (negative = saving). */
  readonly deltaMinor: bigint;
  /** Change between the rounded labels ("−$64"). */
  readonly displayDeltaMinor: bigint;
  readonly currency: CurrencyCode;
}

/** The viewer's biggest savings from skipping one item, priced by the engine; at most `limit`. */
export function skipOptions(state: TripCostState, viewerUid: string, limit = 3): SkipOption[] {
  if (!state.members.some((member) => member.uid === viewerUid)) return [];
  const candidates: PersonalOption[] = state.components
    .filter(
      (c) =>
        SKIPPABLE.has(c.kind) &&
        c.amountMinor !== null &&
        c.amountMinor > 0n &&
        (c.memberIds === undefined || c.memberIds.includes(viewerUid)),
    )
    .map((c) => ({
      id: `skip:${c.id}`,
      label: c.label ?? c.id,
      ops: [{ op: 'withdraw', componentId: c.id, uid: viewerUid }],
    }));
  if (candidates.length === 0) return [];
  const deltas = personalOptionDeltas(state, viewerUid, candidates);
  return deltas
    .flatMap((delta, index) => {
      const option = candidates[index];
      return option === undefined ? [] : [{ delta, option }];
    })
    .filter(({ delta }) => delta.delta.amountMinor < 0n)
    .sort((a, b) => (a.delta.delta.amountMinor < b.delta.delta.amountMinor ? -1 : 1))
    .slice(0, limit)
    .map(({ delta, option }) => ({
      id: option.id,
      componentId: option.id.slice('skip:'.length),
      label: option.label,
      deltaMinor: delta.delta.amountMinor,
      displayDeltaMinor: delta.displayDelta.amountMinor,
      currency: delta.delta.currency,
    }));
}
