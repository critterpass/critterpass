/**
 * The options a private objection offers (3f-4), decided in code: the member's own savings from
 * skipping an item, priced by the cost engine on the trip's stored components, plus "ask the crew
 * anonymously" only in a crew of four or more (a smaller crew gets personal options only, since
 * the timing alone would name them). The guide words and orders these; it never adds one.
 */
import { formatMoney, money } from '@cp/cost-engine';
import { ANONYMOUS_MIN_CREW, type PrivateReason } from '@cp/domain';
import { costStateFromRows, skipOptions, type CostComponentRow } from '@cp/planner';
import type pg from 'pg';

export interface ObjectionOption {
  readonly id: string;
  readonly kind: 'skip_item' | 'ask_crew' | 'follow_up';
  readonly label: string;
  /** Exact change to the member's share, minor units; null when the option moves no money. */
  readonly delta_minor: string | null;
  readonly display_delta_minor: string | null;
  readonly currency: string | null;
  /** Changes something the whole crew shares (only offered to a crew of four or more). */
  readonly shared: boolean;
}

const SKIP_REASONS: ReadonlySet<PrivateReason> = new Set(['cost', 'plan', 'other']);

/**
 * The saving as the member sees it ("$64"), punctuated the way their language writes money, for
 * the guide's wording and the validator.
 */
export function savesLabel(option: ObjectionOption, locale = 'en'): string | null {
  if (option.display_delta_minor === null || option.currency === null) return null;
  const minor = BigInt(option.display_delta_minor);
  return formatMoney(money(minor < 0n ? -minor : minor, option.currency), {
    locale,
    mode: 'local',
  });
}

export async function objectionOptions(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  reason: PrivateReason,
): Promise<ObjectionOption[]> {
  const options: ObjectionOption[] = [];
  if (SKIP_REASONS.has(reason)) {
    const trip = await tx.query<{ currency: string }>(
      `SELECT coalesce(c.settlement_currency, 'USD') AS currency
         FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1`,
      [tripId],
    );
    const members = await tx.query<{ user_id: string; origin: string | null }>(
      `SELECT tp.user_id, upper(u.home_airport) AS origin FROM trip_participants tp
         JOIN users u ON u.id = tp.user_id WHERE tp.trip_id = $1 AND tp.holds_seat
        ORDER BY tp.user_id`,
      [tripId],
    );
    const rows = await tx.query<CostComponentRow>(
      `SELECT component_key, kind, unit, member_ids, amount_minor::text AS amount_minor, currency,
              source, seen_at, origin, label
         FROM cost_components WHERE trip_id = $1 ORDER BY component_key`,
      [tripId],
    );
    const state = costStateFromRows({
      currency: trip.rows[0]?.currency ?? 'USD',
      members: members.rows.map((m) => ({
        uid: m.user_id,
        origin: m.origin !== null && /^[A-Z]{3}$/u.test(m.origin) ? m.origin : null,
      })),
      rows: rows.rows,
    });
    for (const skip of skipOptions(state, uid)) {
      options.push({
        id: skip.id,
        kind: 'skip_item',
        label: `Skip ${skip.label}`,
        delta_minor: skip.deltaMinor.toString(),
        display_delta_minor: skip.displayDeltaMinor.toString(),
        currency: skip.currency,
        shared: false,
      });
    }
  }
  const size = await tx.query<{ size: number }>('SELECT app.trip_crew_size($1) AS size', [tripId]);
  if ((size.rows[0]?.size ?? 0) >= ANONYMOUS_MIN_CREW) {
    options.push({
      id: 'ask_crew',
      kind: 'ask_crew',
      label: 'Ask the crew without saying who asked',
      delta_minor: null,
      display_delta_minor: null,
      currency: null,
      shared: true,
    });
  }
  options.push({
    id: 'follow_up',
    kind: 'follow_up',
    label: 'Still thinking, ask me later',
    delta_minor: null,
    display_delta_minor: null,
    currency: null,
    shared: false,
  });
  return options;
}
