/**
 * How long a visit takes ("TAKES 1H30"): the editors' `time_needed_min` when a curated place has
 * one, else what a place of its kind usually takes. One table, shared by fit, gap ideas and the
 * plan check, so every surface quotes the same length.
 */
const USUAL_VISIT_MIN: Readonly<Record<string, number>> = {
  food: 75,
  temple_shrine: 90,
  museum: 120,
  market: 90,
  nature: 150,
  beach: 180,
  nightlife: 120,
  shopping: 90,
};

/** A visit to a place of a kind with no usual length. */
export const DEFAULT_VISIT_MIN = 90;

export function visitMinutes(place: {
  readonly category: string;
  readonly timeNeededMin?: number | null;
}): number {
  const editorial = place.timeNeededMin;
  if (editorial !== null && editorial !== undefined && editorial > 0) return editorial;
  return USUAL_VISIT_MIN[place.category] ?? DEFAULT_VISIT_MIN;
}
