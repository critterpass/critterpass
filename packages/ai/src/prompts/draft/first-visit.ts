/**
 * The outline's reference for what a good day here holds: how most itinerary pages lay out a first
 * visit, day by day, with the places in visiting order. A place the outline may pick shows its id,
 * so the guide can build a day from the pages' places; the rest are named only. The pages are a
 * reference for a first visit, not the crew's plan: their tastes, pace and must-dos come first.
 */
import { aliases, type DraftPlanInput } from './context';

/** The lines of the reference; none when the destination has no researched first visit. */
export function firstVisitLines(input: DraftPlanInput, offered: ReadonlySet<string>): string[] {
  const days = input.firstVisit?.days ?? [];
  if (days.length === 0) return [];
  const lines = days.map((day, index) => {
    const stops = day.stops.map((stop) =>
      stop.poiId !== null && offered.has(stop.poiId)
        ? `${stop.name} (${aliases(input).place(stop.poiId)})`
        : stop.name,
    );
    const areas = day.areas.length === 0 ? '' : `; ${day.areas.join(' + ')}`;
    return `- Page day ${index + 1} (${day.theme}${areas}): ${stops.join(' → ')}`;
  });
  return [
    '## How itinerary pages lay out a first visit here',
    ...lines,
    'A reference, not the plan: keep their groupings of places and areas where they suit this crew,',
    "and swap in places for the crew's tastes. Our lists decide what can be picked.",
    '',
  ];
}
