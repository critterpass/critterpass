/**
 * What a flight change does to the plan (3k-5), worked out in code so every time the guide shows is
 * one computed here. The delayed members are the flight's travellers; the rest of the crew is
 * unaffected ("Rin still lands at 22:40, nothing changes for her").
 *
 * - A delay or diversion moves the travellers' ready time to landing + {@link EXIT_MIN} (bags,
 *   immigration), rounded up to five minutes. A pickup the travellers are on that was due before
 *   that moves to the ready time; anything else they attend that starts before ready +
 *   {@link SETTLE_MIN} moves to that time. Items starting before the old landing, or on a later
 *   local day, are untouched.
 * - A cancellation or missed connection has no new landing: nothing is retimed, the travellers get
 *   the airline's rebooking link, and their items that day are listed as at risk.
 * - A delay under {@link MATERIAL_DELAY_MIN} is not a disruption.
 */
import { toLocalWallTime } from '@cp/domain';

const MINUTE = 60_000;
/** A delay shorter than this changes nothing worth telling anyone. */
export const MATERIAL_DELAY_MIN = 30;
/** Landing to kerb: taxi-in, immigration, bags. */
export const EXIT_MIN = 30;
/** Kerb to the first thing on the plan: transfer and a breather. */
export const SETTLE_MIN = 90;

export type FlightCause = 'delay' | 'cancelled' | 'diverted' | 'missed_connection';
export type ItemRole = 'pickup' | 'check_in' | 'meal' | 'activity' | 'transfer' | 'other';

export interface FlightChange {
  readonly segmentId: string;
  readonly carrier: string;
  readonly flightNo: string;
  readonly cause: FlightCause;
  readonly scheduledArrival: Date;
  /** Estimated landing; null when the flight will not land (cancelled, connection missed). */
  readonly newArrival: Date | null;
  /** Arrival airport (IATA), or the diversion airport. */
  readonly arrivalAirport: string;
  readonly travellerIds: readonly string[];
  /** The destination's zone: all local times are read here. */
  readonly tz: string;
}

export interface ImpactItem {
  readonly id: string;
  readonly stableId: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  /** Null = the whole crew attends. */
  readonly attendeeIds: readonly string[] | null;
  readonly role: ItemRole;
  /** The driver, villa or restaurant behind the item, when the desk can message them. */
  readonly providerId: string | null;
  readonly providerName: string | null;
  readonly bookingId: string | null;
  /** A booking or must-do that may not move without a yes. */
  readonly locked: boolean;
}

export interface ImpactLeaveBy {
  readonly planItemStableId: string;
  readonly participantIds: readonly string[];
}

export interface MemberArrival {
  readonly userId: string;
  readonly arrival: Date;
}

export interface FlightImpactInput {
  readonly change: FlightChange;
  readonly crewIds: readonly string[];
  readonly items: readonly ImpactItem[];
  readonly leaveBys: readonly ImpactLeaveBy[];
  /** Other members' own flights landing the same day. */
  readonly otherArrivals: readonly MemberArrival[];
}

export interface AffectedItem {
  readonly item: ImpactItem;
  readonly attendees: readonly string[];
  /** Where the item moves; null when it cannot be computed (no landing) and is only at risk. */
  readonly newStart: Date | null;
}

export interface FlightImpact {
  readonly material: boolean;
  readonly cause: FlightCause;
  readonly travellerIds: readonly string[];
  readonly delayMin: number | null;
  readonly newArrival: Date | null;
  readonly readyAt: Date | null;
  readonly affected: readonly AffectedItem[];
  readonly leaveByStableIds: readonly string[];
  readonly unaffected: readonly { readonly userId: string; readonly arrival: Date | null }[];
  readonly facts: Readonly<Record<string, string | number>>;
}

const roundUp5 = (at: Date): Date => new Date(Math.ceil(at.getTime() / (5 * MINUTE)) * 5 * MINUTE);
const addMin = (at: Date, minutes: number): Date => new Date(at.getTime() + minutes * MINUTE);

export function localTime(at: Date, tz: string): string {
  return toLocalWallTime(at, tz).time.slice(0, 5);
}

function attendeesOf(item: ImpactItem, crewIds: readonly string[]): string[] {
  return [...new Set(item.attendeeIds ?? crewIds)].sort();
}

function newStartFor(item: ImpactItem, readyAt: Date): Date | null {
  if (item.role === 'pickup') return item.startsAt < readyAt ? readyAt : null;
  const earliest = roundUp5(addMin(readyAt, SETTLE_MIN));
  return item.startsAt < earliest ? earliest : null;
}

export function analyzeFlightImpact(input: FlightImpactInput): FlightImpact {
  const { change } = input;
  const travellers = [...new Set(change.travellerIds)].sort();
  const onFlight = new Set(travellers);
  const landingDay = toLocalWallTime(change.scheduledArrival, change.tz).date;
  const sameDay = (at: Date) => toLocalWallTime(at, change.tz).date === landingDay;
  const delayMin =
    change.newArrival === null
      ? null
      : Math.round((change.newArrival.getTime() - change.scheduledArrival.getTime()) / MINUTE);
  const lands = change.newArrival !== null;
  const material =
    change.cause !== 'delay' || (delayMin !== null && delayMin >= MATERIAL_DELAY_MIN);
  const readyAt = lands && material ? roundUp5(addMin(change.newArrival, EXIT_MIN)) : null;

  const affected: AffectedItem[] = [];
  if (material) {
    const windowStart = addMin(change.scheduledArrival, -60);
    for (const item of [...input.items].sort((a, b) => +a.startsAt - +b.startsAt)) {
      const attendees = attendeesOf(item, input.crewIds);
      if (!attendees.some((id) => onFlight.has(id))) continue;
      if (item.startsAt < windowStart || !sameDay(item.startsAt)) continue;
      if (item.role !== 'pickup' && item.startsAt < change.scheduledArrival) continue;
      if (readyAt === null) {
        affected.push({ item, attendees, newStart: null });
        continue;
      }
      const newStart = newStartFor(item, readyAt);
      if (newStart !== null) affected.push({ item, attendees, newStart });
    }
  }
  const touched = new Set(affected.map((entry) => entry.item.stableId));
  const leaveByStableIds = input.leaveBys
    .filter(
      (leaveBy) =>
        touched.has(leaveBy.planItemStableId) &&
        leaveBy.participantIds.some((id) => onFlight.has(id)),
    )
    .map((leaveBy) => leaveBy.planItemStableId);
  const arrivals = new Map(input.otherArrivals.map((entry) => [entry.userId, entry.arrival]));
  const unaffected = [...new Set(input.crewIds)]
    .filter((id) => !onFlight.has(id))
    .sort()
    .map((userId) => ({ userId, arrival: arrivals.get(userId) ?? null }));

  const facts: Record<string, string | number> = {
    flight: `${change.carrier}${change.flightNo}`,
    airport: change.arrivalAirport,
    scheduled_arrival: localTime(change.scheduledArrival, change.tz),
    travellers: travellers.length,
  };
  if (change.newArrival !== null) facts['new_arrival'] = localTime(change.newArrival, change.tz);
  if (delayMin !== null) facts['delay_min'] = delayMin;
  if (readyAt !== null) facts['ready_at'] = localTime(readyAt, change.tz);

  return {
    material,
    cause: change.cause,
    travellerIds: travellers,
    delayMin,
    newArrival: change.newArrival,
    readyAt,
    affected,
    leaveByStableIds,
    unaffected,
    facts,
  };
}
