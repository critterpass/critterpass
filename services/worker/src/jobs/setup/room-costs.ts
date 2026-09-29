/**
 * Room prices for `cost.recompute` (the only writer of `cost_components`): one component per
 * occupied room of the trip's room plan — its nightly price times its stay's nights, split between
 * the people in it (unit `room`), in the plan's currency, source `estimate`. The editorial index's
 * trip-wide stay estimate then covers only the nights no room plan prices; an empty room costs
 * nobody anything.
 */
import { assertCurrencyCode, type CostComponent } from '@cp/cost-engine';
import type pg from 'pg';

export interface RoomPlanPricing {
  readonly components: readonly CostComponent[];
  /** Nights the room plan prices (summed over its stays). */
  readonly pricedNights: number;
}

interface PlanRoom {
  readonly stay_key: string;
  readonly stay_type?: string;
  readonly stay_nights: number;
  readonly key: string;
  readonly nightly_minor: number;
  readonly label?: string;
}

const DAY_MS = 86_400_000;

export async function loadRoomComponents(
  tx: pg.PoolClient,
  tripId: string,
): Promise<RoomPlanPricing> {
  const { rows } = await tx.query<{ rooms: PlanRoom[]; currency: string | null; updated_at: Date }>(
    'SELECT rooms, currency, updated_at FROM room_plans WHERE trip_id = $1',
    [tripId],
  );
  const plan = rows[0];
  if (plan === undefined || plan.currency === null || plan.rooms.length === 0) {
    return { components: [], pricedNights: 0 };
  }
  const currency = assertCurrencyCode(plan.currency);
  const assigned = await tx.query<{ stay_key: string; room_key: string; user_id: string }>(
    'SELECT stay_key, room_key, user_id FROM room_assignments WHERE trip_id = $1 ORDER BY user_id',
    [tripId],
  );
  const nightsByStay = new Map<string, number>();
  for (const room of plan.rooms) nightsByStay.set(room.stay_key, room.stay_nights);
  const components: CostComponent[] = plan.rooms.flatMap((room) => {
    const memberIds = assigned.rows
      .filter((a) => a.stay_key === room.stay_key && a.room_key === room.key)
      .map((a) => a.user_id);
    if (memberIds.length === 0) return [];
    return [
      {
        id: `room:${room.stay_key}:${room.key}`,
        kind: 'stay' as const,
        unit: 'room' as const,
        amountMinor: BigInt(room.nightly_minor) * BigInt(room.stay_nights),
        currency,
        source: 'estimate' as const,
        seenAt: plan.updated_at.toISOString(),
        memberIds,
        label: [room.stay_type, room.label ?? room.key].filter(Boolean).join(' · '),
      },
    ];
  });
  const pricedNights = [...nightsByStay.values()].reduce((sum, nights) => sum + nights, 0);
  return { components, pricedNights };
}

/**
 * The index estimates with their stay line cut to the nights no room plan prices (dropped when the
 * plan prices them all), followed by the room components.
 */
export function pricedByRooms(
  index: readonly CostComponent[],
  rooms: RoomPlanPricing,
  trip: { readonly start_date: string | null; readonly end_date: string | null },
): CostComponent[] {
  if (rooms.components.length === 0) return [...index];
  const nights =
    trip.start_date === null || trip.end_date === null
      ? 0
      : Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / DAY_MS);
  const remaining = Math.max(0, nights - rooms.pricedNights);
  const adjusted = index.flatMap((component) => {
    if (component.kind !== 'stay' || !component.id.startsWith('index:stay:')) return [component];
    if (remaining === 0 || nights === 0 || component.amountMinor === null) return [];
    const nightly = component.amountMinor / BigInt(nights);
    return [{ ...component, amountMinor: nightly * BigInt(remaining) }];
  });
  return [...adjusted, ...rooms.components];
}
