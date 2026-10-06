/**
 * The area page's decisions, apart from its drawing: what stands where ADD AS A DAY TRIP would be
 * for this person, trip and connection, and the day picker (which days a day trip may take, what
 * each warns about and how many stops leave the day).
 */
/* eslint-disable lingui/no-unlocalized-strings -- trip statuses and roles, never copy. */
import type { PlanState } from '@cp/domain';

import type { DayArea, TripAreas } from '@/data/areas/trip-areas-model';

export type AreaAction =
  /** The organiser may add it. */
  | { readonly kind: 'add' }
  /** It is on a day: the organiser may change the day or remove it; a member reads the day. */
  | { readonly kind: 'onDay'; readonly dayNo: number; readonly canChange: boolean }
  | { readonly kind: 'member'; readonly organiser: string | null }
  | { readonly kind: 'offline' }
  | { readonly kind: 'drafting' }
  | { readonly kind: 'noPlan' }
  | { readonly kind: 'closed' };

const CLOSED = new Set(['post_trip', 'archived', 'cancelled']);
const GUIDE_WORKING = new Set(['drafting', 'redrafting']);

export interface AreaActionInput {
  readonly organiser: boolean;
  readonly organiserName: string | null;
  readonly status: string | null;
  readonly online: boolean;
  /** The version a change is based on; null while the trip has no days yet. */
  readonly versionId: string | null;
  /** The day the area is on, if any. */
  readonly onDay: DayArea | null;
}

export function areaAction(input: AreaActionInput): AreaAction {
  const status = input.status ?? '';
  const changes =
    input.organiser && input.online && !CLOSED.has(status) && !GUIDE_WORKING.has(status);
  if (input.onDay !== null) {
    return { kind: 'onDay', dayNo: input.onDay.dayNo, canChange: changes };
  }
  if (CLOSED.has(status)) return { kind: 'closed' };
  if (!input.organiser) return { kind: 'member', organiser: input.organiserName };
  if (GUIDE_WORKING.has(status)) return { kind: 'drafting' };
  if (input.versionId === null) return { kind: 'noPlan' };
  return input.online ? { kind: 'add' } : { kind: 'offline' };
}

export interface PickerDay {
  readonly dayNo: number;
  readonly date: string | null;
  /** The trip's first or last day: a day trip leaves little of it. */
  readonly edge: 'first' | 'last' | null;
  /** The day holds a booking, which stays on it. */
  readonly booked: boolean;
  /** The day is already a day trip to another area (named when known). */
  readonly otherArea: string | null;
  /** Stops that go back to Ideas when the day moves to the area. */
  readonly moves: number;
}

/**
 * The days of the stop the area is reached from. A stop on a place leaves for Ideas unless it is
 * booked; a stop on a dropped pin stays (as the server decides it).
 */
export function pickerDays(
  areas: TripAreas,
  state: PlanState,
  fromDestinationId: string,
  areaId: string,
): PickerDay[] {
  const stop = areas.stops.find((one) => one.destinationId === fromDestinationId);
  if (stop === undefined) return [];
  const last = areas.days.reduce((max, day) => Math.max(max, day.dayNo), 1);
  return areas.days
    .filter((day) => day.stopIndex === stop.index && day.areaId !== areaId)
    .map((day) => {
      const items = state.items.filter((item) => item.day_no === day.dayNo);
      return {
        dayNo: day.dayNo,
        date: day.date,
        edge: day.dayNo === 1 ? 'first' : day.dayNo === last ? 'last' : null,
        booked: items.some((item) => item.booking_id != null),
        otherArea: day.dayTrip ? (day.areaName ?? '') : null,
        moves: items.filter((item) => item.poi_id != null && item.booking_id == null).length,
      };
    });
}

/** Who is putting the plan together, by first name; null when the crew row has not synced. */
export function organiserFirstName(
  crew: readonly { readonly role: string | null; readonly display_name: string | null }[],
): string | null {
  const row = crew.find((member) => member.role === 'organiser');
  const first = (row?.display_name ?? '').trim().split(/\s+/u)[0] ?? '';
  return first === '' ? null : first;
}
