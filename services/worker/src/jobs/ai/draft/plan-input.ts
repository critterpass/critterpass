/**
 * The drafting pipeline's input from what `load.ts` read: the trip frame (dates, zone, crew,
 * chronotypes from the early-start and late-start taste tags, diets, the budget left for the days
 * once flights and stay nights are paid), the planner's candidate pools, the travel matrix, and
 * stable ids derived from the job so a retried step writes the same rows.
 */
import { derivedUuid, personaIdSchema, type DraftPlanInput, type PersonaId } from '@cp/ai';
import type { ClosureRecord } from '@cp/domain';
import {
  candidatePools,
  datesOf,
  straightLineMatrix,
  timeWords,
  type Chronotype,
  type DraftPoi,
  type ResolvedWishes,
  type TripFrame,
} from '@cp/planner';

import type { DraftTripData } from './load';

export interface PlanInputOptions {
  readonly jobId: string;
  readonly skeletonRoute: DraftPlanInput['skeletonRoute'];
  readonly closures: readonly ClosureRecord[];
  /** Places the hand-typed must-dos name (see the planner's `resolveWishes`). */
  readonly wished?: ResolvedWishes;
  readonly ignoreNames?: readonly (readonly string[])[];
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

export function guideOf(trip: DraftTripData): PersonaId {
  const parsed = personaIdSchema.safeParse(trip.guideSlug);
  return parsed.success ? parsed.data : 'guest';
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
  const frame: TripFrame = {
    tz: trip.tz,
    currency: trip.currency,
    dates: tripDates(trip),
    members: trip.members.map((m) => m.uid),
    chronotypes,
    diets: trip.diets,
    arrivalMin: null,
    departureMin: null,
    budgetPpMinor:
      trip.budget === null
        ? null
        : Math.max(0, trip.budget.targetMinor - trip.budget.flightsMinor - staysPpMinor(trip)),
    mustDos: trip.mustDos.map((m) => ({
      id: m.id,
      ownerId: m.ownerId,
      poiId: m.poiId ?? options.wished?.places.get(m.id) ?? null,
      title: m.title,
      // The member's own words for when ("at sunrise"); the guide may add one for a wish.
      when: timeWords(m.title),
    })),
    closures: options.closures,
  };
  return {
    guide: guideOf(trip),
    destination: trip.destination,
    frame,
    pois,
    pools: candidatePools({
      pois: places,
      frame,
      tastes,
      include: options.wished?.offered ?? [],
      ignoreNames: options.ignoreNames ?? [],
    }),
    tastes,
    bands: trip.bands,
    travel: straightLineMatrix(pois),
    stayType: trip.rooms?.stays[0]?.stayType ?? null,
    names: Object.fromEntries(trip.members.map((m) => [m.uid, m.name])),
    wishes: trip.mustDos
      .filter((m) => m.poiId === null)
      .map((m) => ({ id: m.id, text: m.title, options: options.wished?.options.get(m.id) ?? [] })),
    idFor: (key) => derivedUuid(`${options.jobId}:${key}`),
    skeletonRoute: options.skeletonRoute,
  };
}
