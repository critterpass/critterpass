/**
 * Which blog place a drafted stop is. Our rows carry the open-data name and point, the researchers
 * wrote the name a map shows and an approximate point, so a stop is the blog place whose name it
 * shares most words with nearby (within 2 km, at least half of the shorter name), else the blog
 * place right beside it (60 m). A stop no blog place matches still gets the area of the nearest
 * blog place within 1.2 km, so a day's areas can be counted.
 */
import { metresBetween, nameTokens } from '@cp/planner';

import type { ReferencePlace } from './reference';

const NAME_RADIUS_M = 2_000;
const BESIDE_M = 60;
const AREA_RADIUS_M = 1_200;
const MIN_OVERLAP = 0.5;

/** Words too common in place names to tell two places apart. */
const COMMON = new Set(['the', 'of', 'de', 'da', 'do', 'and', 'cafe', 'restaurant', 'park']);

export interface Locatable {
  readonly name: string;
  readonly nameLocal?: string | null;
  readonly lat: number;
  readonly lng: number;
}

function words(...names: readonly (string | null | undefined)[]): Set<string> {
  return new Set(
    names.flatMap((name) => (name == null ? [] : nameTokens(name))).filter((w) => !COMMON.has(w)),
  );
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shorter = Math.min(a.size, b.size);
  if (shorter === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / shorter;
}

export function matchPlace(
  stop: Locatable,
  places: readonly ReferencePlace[],
): ReferencePlace | null {
  const mine = words(stop.name, stop.nameLocal);
  let best: { place: ReferencePlace; overlap: number; metres: number } | null = null;
  let beside: { place: ReferencePlace; metres: number } | null = null;
  for (const place of places) {
    const metres = metresBetween(stop, place);
    if (metres > NAME_RADIUS_M) continue;
    const shared = overlap(mine, words(place.name_en, place.name_local));
    if (
      shared >= MIN_OVERLAP &&
      (best === null || shared > best.overlap || (shared === best.overlap && metres < best.metres))
    ) {
      best = { place, overlap: shared, metres };
    }
    if (metres <= BESIDE_M && (beside === null || metres < beside.metres))
      beside = { place, metres };
  }
  return best?.place ?? beside?.place ?? null;
}

/** The area of the nearest blog place within 1.2 km that names one. */
export function nearestArea(stop: Locatable, places: readonly ReferencePlace[]): string | null {
  let nearest: { area: string; metres: number } | null = null;
  for (const place of places) {
    if (place.area == null) continue;
    const metres = metresBetween(stop, place);
    if (metres <= AREA_RADIUS_M && (nearest === null || metres < nearest.metres))
      nearest = { area: place.area, metres };
  }
  return nearest?.area ?? null;
}
