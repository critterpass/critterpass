/**
 * The drafting pipeline's input from what `load.ts` read: the trip frame (dates, zone, crew,
 * chronotypes from the early-start and late-start taste tags, diets, the budget left for the days
 * once flights and stay nights are paid, when the crew's shared flights or trains land on the
 * first day and leave on the last), the planner's candidate pools, the travel matrix, and stable
 * ids derived from the job so a retried step writes the same rows. A must-do picked from search is
 * planned at the recommended row of its spot when search handed back a stay or shop beside it.
 */
import { derivedUuid, personaIdSchema, type DraftPlanInput, type PersonaId } from '@cp/ai';
import type { ClosureRecord } from '@cp/domain';
import {
  candidatePools,
  datesOf,
  knownPlaceFor,
  minuteOfDate,
  resolveWishes,
  straightLineMatrix,
  type Chronotype,
  type DraftPoi,
  type ResolvedWishes,
  type TripFrame,
  type RoutedPairs,
} from '@cp/planner';

import type { DraftTripData } from './load';

export interface PlanInputOptions {
  readonly jobId: string;
  readonly skeletonRoute: DraftPlanInput['skeletonRoute'];
  readonly closures: readonly ClosureRecord[];
  /** What the guide is offered for the typed must-dos still without a place (`wishOffer`). */
  readonly wished?: ResolvedWishes;
  readonly ignoreNames?: readonly (readonly string[])[];
  /** Places the crew saved to Ideas: offered to the guide ahead of the rest. */
  readonly prefer?: readonly string[];
  /** Places the organiser already put on a day: known to the planner, never offered again. */
  readonly notOffered?: ReadonlySet<string>;
  /** Minutes the routing service already gave between the places (./road-minutes). */
  readonly routed?: RoutedPairs;
}

export function tripDates(trip: Pick<DraftTripData, 'startDate' | 'endDate'>): string[] {
  const days = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1;
  return datesOf(trip.startDate, Math.max(1, days));
}

export function staysPpMinor(trip: DraftTripData): number {
  return (trip.rooms?.stays ?? []).reduce(
    (sum, stay) => sum + stay.nights * stay.nightlyPpMinor,
    0,
  );
}

function chronotypeOf(tastes: readonly string[]): Chronotype | null {
  if (tastes.includes('early_starts')) return 'early_bird';
  if (tastes.includes('late_starts')) return 'night_owl';
  return null;
}

/**
 * When the crew is there to plan for: the last shared flight or train to land on the first day,
 * and the first to leave on the last day (after that landing on a one-day trip). Null where no
 * booking says; the planner then assumes a midday landing and an early-evening departure.
 */
export function transportTimes(
  trip: Pick<DraftTripData, 'startDate' | 'endDate' | 'tz' | 'transport'>,
): Pick<TripFrame, 'arrivalMin' | 'departureMin'> {
  const dates = tripDates(trip);
  const first = dates[0] as string;
  const last = dates[dates.length - 1] as string;
  const minutesOn = (date: string, instants: readonly (string | null)[]): number[] =>
    instants.flatMap((instant) => {
      if (instant === null) return [];
      const minute = minuteOfDate(new Date(instant), date, trip.tz);
      return minute >= 0 && minute < 24 * 60 ? [minute] : [];
    });
  const landings = minutesOn(
    first,
    trip.transport.map((leg) => leg.endsAt),
  );
  const arrivalMin = landings.length === 0 ? null : Math.max(...landings);
  const leavings = minutesOn(
    last,
    trip.transport.map((leg) => leg.startsAt),
  ).filter((minute) => first !== last || arrivalMin === null || minute > arrivalMin);
  return { arrivalMin, departureMin: leavings.length === 0 ? null : Math.min(...leavings) };
}

export function guideOf(trip: DraftTripData): PersonaId {
  const parsed = personaIdSchema.safeParse(trip.guideSlug);
  return parsed.success ? parsed.data : 'guest';
}

/**
 * What the guide is offered for the typed must-dos still without a place: the places their words
 * name, or, for a dish ("Mì Quảng for breakfast"), the curated eateries known for it. The words
 * only build the offer and never place a wish: a place is decided once when the must-do is set
 * (`ai.fit_check`), and a wish that is still open (that check found none, or has not run yet
 * because she typed it just before asking for the draft) is placed by the guide's answer.
 */
export function wishOffer(
  wishes: readonly { readonly id: string; readonly text: string }[],
  candidates: readonly DraftPoi[],
  ignore: readonly (readonly string[])[],
): ResolvedWishes {
  const found = resolveWishes(wishes, candidates, ignore);
  return {
    places: new Map(),
    offered: [...new Set([...found.places.values(), ...found.offered])],
    options: found.options,
  };
}

export function buildPlanInput(
  trip: DraftTripData,
  places: readonly DraftPoi[],
  options: PlanInputOptions,
): DraftPlanInput {
  const pois = new Map(places.map((poi) => [poi.id, poi]));
  const chronotypes: Record<string, Chronotype> = {};
  const tastes: Record<string, number> = {};
  for (const member of trip.members) {
    const kind = chronotypeOf(member.tastes);
    if (kind !== null) chronotypes[member.uid] = kind;
    for (const tag of member.tastes) tastes[tag] = (tastes[tag] ?? 0) + 1;
  }
  const ignore = options.ignoreNames ?? [];
  const knownRow = (poiId: string): string => {
    const own = pois.get(poiId);
    return own === undefined ? poiId : knownPlaceFor(own, places, ignore).id;
  };
  const frame: TripFrame = {
    tz: trip.tz,
    currency: trip.currency,
    dates: tripDates(trip),
    members: trip.members.map((m) => m.uid),
    chronotypes,
    diets: trip.diets,
    ...transportTimes(trip),
    budgetPpMinor:
      trip.budget === null
        ? null
        : Math.max(0, trip.budget.targetMinor - trip.budget.flightsMinor - staysPpMinor(trip)),
    mustDos: trip.mustDos.map((m) => ({
      id: m.id,
      ownerId: m.ownerId,
      poiId: m.poiId === null ? (options.wished?.places.get(m.id) ?? null) : knownRow(m.poiId),
      title: m.title,
      // Decided once when the must-do was set (`must_dos.time_of_day`); never read from words.
      when: m.when ?? null,
    })),
    closures: options.closures,
  };
  return {
    guide: guideOf(trip),
    destination: trip.destination,
    frame,
    pois,
    pools: candidatePools({
      pois:
        options.notOffered === undefined
          ? places
          : places.filter((poi) => !options.notOffered?.has(poi.id)),
      frame,
      tastes,
      include: [...(options.wished?.offered ?? []), ...(options.prefer ?? [])],
      ignoreNames: ignore,
      ...(options.routed === undefined ? {} : { routed: options.routed }),
    }),
    tastes,
    bands: trip.bands,
    travel: straightLineMatrix(pois, options.routed),
    ...(options.routed === undefined ? {} : { routed: options.routed }),
    stayType: trip.rooms?.stays[0]?.stayType ?? null,
    names: Object.fromEntries(trip.members.map((m) => [m.uid, m.name])),
    wishes: trip.mustDos
      .filter((m) => m.poiId === null)
      .map((m) => ({ id: m.id, text: m.title, options: options.wished?.options.get(m.id) ?? [] })),
    idFor: (key) => derivedUuid(`${options.jobId}:${key}`),
    ...(trip.languages === undefined ? {} : { destinationLanguages: trip.languages }),
    skeletonRoute: options.skeletonRoute,
  };
}
