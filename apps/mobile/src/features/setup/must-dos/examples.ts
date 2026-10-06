/**
 * Must-dos to tap when the list is empty: a few of the guide's places at the destination, its
 * must-sees first, then its best-ranked picks, from the api's browse of the destination (its last
 * good copy offline). Something to eat comes first when the guide has one (a dish is the must-do
 * most people name), then the top sights, each under the name the reader sees places by there.
 */
import { useEffect, useMemo, useState } from 'react';

import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { dataOf } from '@/data/travel-data/freshness';

import type { SetupServices } from '../data/services';
import { readBrowse, readerOf, type CandidatePlace } from './places';

export interface ExamplePlaceRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string | null;
}

export interface ExamplePlace {
  readonly id: string;
  readonly name: string;
}

export const EXAMPLES_SHOWN = 3;
const FOOD = new Set(['food']);
/** Never a must-do on their own: where she sleeps, how she gets there, a pharmacy. */
const NOT_A_MUST_DO = new Set(['stay', 'transit', 'health']);

/** How many of the browse's best places the examples are chosen from. */
const CHOSEN_FROM = 24;

/**
 * The browse's guide places best first: must-sees, then picks by rank, then the rest of the
 * curated set in the api's order. Open-data places nobody chose are never offered.
 */
export function guidePlaces(places: readonly CandidatePlace[]): ExamplePlaceRow[] {
  const chosen = places.filter(
    (place) => place.mustSee || place.recommended || place.pickRank !== null,
  );
  const order = (place: CandidatePlace) => (place.mustSee ? 0 : place.pickRank === null ? 2 : 1);
  return chosen
    .map((place, index) => ({ place, index }))
    .sort(
      (a, b) =>
        order(a.place) - order(b.place) ||
        (a.place.pickRank ?? 0) - (b.place.pickRank ?? 0) ||
        a.index - b.index,
    )
    .slice(0, CHOSEN_FROM)
    .map(({ place }) => ({
      id: place.id,
      name: place.name,
      name_local: place.nameLocal,
      category: place.category,
    }));
}

/** `rows` best first. `localNames`: the reader reads the place's own language. */
export function examplePlaces(
  rows: readonly ExamplePlaceRow[],
  localNames: boolean,
  limit = EXAMPLES_SHOWN,
): ExamplePlace[] {
  const usable = rows.filter((row) => !NOT_A_MUST_DO.has(row.category ?? ''));
  const food = usable.find((row) => FOOD.has(row.category ?? ''));
  const sights = usable.filter((row) => !FOOD.has(row.category ?? ''));
  const chosen = [
    ...sights.slice(0, food === undefined ? limit : limit - 1),
    ...(food === undefined ? [] : [food]),
  ];
  // Short of sights, the rest of the list fills in.
  for (const row of usable) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(row)) chosen.push(row);
  }
  return chosen.slice(0, limit).map((row) => ({
    id: row.id,
    name:
      localNames && row.name_local !== null && row.name_local !== '' ? row.name_local : row.name,
  }));
}

/** The examples for the trip's destination, under the names the reader sees places by there. */
export function useExamplePlaces(
  services: SetupServices,
  destinationId: string | null,
): readonly ExamplePlace[] {
  const readsLocal = useReadsLocalNames(destinationId);
  const [answer, setAnswer] = useState<{
    readonly id: string;
    readonly places: readonly CandidatePlace[];
  } | null>(null);
  useEffect(() => {
    if (destinationId === null) return undefined;
    let live = true;
    void readBrowse(readerOf(services), destinationId).then((state) => {
      if (live) setAnswer({ id: destinationId, places: dataOf(state)?.results ?? [] });
    });
    return () => {
      live = false;
    };
  }, [services, destinationId]);
  const places = answer !== null && answer.id === destinationId ? answer.places : null;
  return useMemo(
    () => (places === null ? [] : examplePlaces(guidePlaces(places), readsLocal)),
    [places, readsLocal],
  );
}
