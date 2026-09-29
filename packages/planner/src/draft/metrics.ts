/**
 * Deterministic draft numbers: per-day and per-trip cost per person, time in transit (the travel
 * the scheduler put before each stop), active time and stops, and a redraft's deltas against the
 * day it replaces. The review and diff screens show only these; the guide never states a number.
 */
import type {
  DayMetrics,
  DraftDay,
  DraftItem,
  DraftMetrics,
  Itinerary,
  RedraftMetrics,
} from '@cp/domain';

const MINUTE = 60_000;

function itemCostPpMinor(item: DraftItem, crewSize: number): number {
  if (item.cost_model === 'group') return Math.round(item.amount_minor / Math.max(1, crewSize));
  return item.amount_minor;
}

export function dayMetrics(day: DraftDay, crewSize: number): DayMetrics {
  let transit = 0;
  let active = 0;
  let cost = 0;
  for (const item of day.items) {
    transit += item.travel_min;
    active += Math.round((Date.parse(item.ends_at) - Date.parse(item.starts_at)) / MINUTE);
    cost += itemCostPpMinor(item, crewSize);
  }
  return {
    day_no: day.day_no,
    transit_min: transit,
    active_min: active,
    stops: day.items.length,
    cost_pp_minor: cost,
  };
}

export function itineraryCostPpMinor(itinerary: Itinerary, crewSize: number): number {
  return itinerary.days.reduce((sum, day) => sum + dayMetrics(day, crewSize).cost_pp_minor, 0);
}

export interface ItineraryMetricsInput {
  readonly itinerary: Itinerary;
  readonly crewSize: number;
  /** Stay nights per person, added to the trip's cost (never part of a day). */
  readonly staysPpMinor: number;
  readonly targetPpMinor: number | null;
  readonly validation: DraftMetrics['validation'];
}

export function itineraryMetrics(input: ItineraryMetricsInput): DraftMetrics {
  const days = input.itinerary.days.map((day) => dayMetrics(day, input.crewSize));
  const cost = days.reduce((sum, day) => sum + day.cost_pp_minor, 0) + input.staysPpMinor;
  return {
    currency: input.itinerary.currency,
    cost_pp_minor: cost,
    target_pp_minor: input.targetPpMinor,
    over_by_pp_minor: input.targetPpMinor === null ? 0 : Math.max(0, cost - input.targetPpMinor),
    transit_min: days.reduce((sum, day) => sum + day.transit_min, 0),
    days,
    validation: input.validation,
  };
}

/** Must-dos an itinerary still places, out of the ones it had to. */
export function mustDosKept(
  itinerary: Itinerary,
  required: readonly string[],
): { kept: number; total: number } {
  const placed = new Set(
    itinerary.days.flatMap((day) => day.items.map((item) => item.must_do_id)).filter(Boolean),
  );
  return { kept: required.filter((id) => placed.has(id)).length, total: required.length };
}

export interface RedraftMetricsInput {
  readonly base: DraftDay;
  readonly candidate: DraftDay;
  /** The whole candidate itinerary (the kept count is trip-wide). */
  readonly candidateItinerary: Itinerary;
  readonly requiredMustDoIds: readonly string[];
  readonly crewSize: number;
  readonly currency: string;
}

export function redraftMetrics(input: RedraftMetricsInput): RedraftMetrics {
  const before = dayMetrics(input.base, input.crewSize);
  const after = dayMetrics(input.candidate, input.crewSize);
  const kept = mustDosKept(input.candidateItinerary, input.requiredMustDoIds);
  return {
    transit_delta_min: after.transit_min - before.transit_min,
    active_delta_min: after.active_min - before.active_min,
    pace: after.stops < before.stops ? 'slower' : after.stops > before.stops ? 'faster' : 'same',
    must_dos_kept: kept.kept,
    must_dos_total: kept.total,
    cost_delta_pp_minor: after.cost_pp_minor - before.cost_pp_minor,
    currency: input.currency,
  };
}

/** The diff screen's chips in English (the app renders the same facts through its catalogs). */
export function metricChipLabels(metrics: RedraftMetrics): string[] {
  const transit =
    metrics.transit_delta_min < 0
      ? `${-metrics.transit_delta_min} MIN LESS ON TRAINS`
      : metrics.transit_delta_min > 0
        ? `${metrics.transit_delta_min} MIN MORE ON TRAINS`
        : 'SAME TIME ON TRAINS';
  const pace = { slower: 'SLOWER PACE', same: 'SAME PACE', faster: 'FULLER PACE' }[metrics.pace];
  const mustDos =
    metrics.must_dos_kept === metrics.must_dos_total
      ? `ALL ${metrics.must_dos_total} MUST-DOS KEPT`
      : `${metrics.must_dos_kept} OF ${metrics.must_dos_total} MUST-DOS KEPT`;
  return [transit, pace, mustDos];
}
