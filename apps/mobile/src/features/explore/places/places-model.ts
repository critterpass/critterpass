/**
 * The trip's places as the places map and list read them (7c-1…7c-3): the plan's stops, the crew's
 * ideas (saved, not in a day) and the destination's curated places, each once, minus the places I
 * hid. A place keeps the strongest standing it has: in the plan, then saved, then Tokek's.
 */
import { distinctPlaces } from '@cp/domain';

import type { MapPoi } from '../map-model';

export type PlaceStanding = 'plan' | 'saved' | 'suggested';

export interface HubPlace {
  /** The curated place's id, or the idea's id for a pin that is no curated place. */
  readonly id: string;
  readonly poiId: string | null;
  readonly ideaId: string | null;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly standing: PlaceStanding;
  /** Who saved it (ideas) in save order. */
  readonly backerIds: readonly string[];
  /** The plan's day for a stop. */
  readonly dayNo: number | null;
  readonly mustSee: boolean;
  readonly hours: unknown;
  /** The editors' best-time line, for Tokek's suggestions. */
  readonly bestTime: string | null;
}

export interface PlanStop {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly dayNo: number;
}

export interface IdeaPlace {
  readonly id: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly backerIds: readonly string[];
}

export interface HubSources {
  readonly curated: readonly MapPoi[];
  readonly ideas: readonly IdeaPlace[];
  readonly stops: readonly PlanStop[];
  readonly hiddenIds: ReadonlySet<string>;
  /** Results mode (a search's MAP or LIST): only these places. */
  readonly results?: ReadonlySet<string> | null | undefined;
  /** The destination's name, so "Ubud Palace" and "Palace" read as one place in Ubud. */
  readonly destination?: string | undefined;
}

const RANK: Readonly<Record<PlaceStanding, number>> = { plan: 0, saved: 1, suggested: 2 };

export function hubPlaces(sources: HubSources): HubPlace[] {
  const curated = new Map(sources.curated.map((poi) => [poi.id, poi]));
  const all: HubPlace[] = [];
  for (const stop of sources.stops) {
    all.push({
      id: stop.poiId,
      poiId: stop.poiId,
      ideaId: null,
      name: stop.name,
      category: stop.category,
      lat: stop.lat,
      lng: stop.lng,
      standing: 'plan',
      backerIds: [],
      dayNo: stop.dayNo,
      mustSee: curated.get(stop.poiId)?.mustSee ?? false,
      hours: curated.get(stop.poiId)?.hours ?? null,
      bestTime: curated.get(stop.poiId)?.bestTime ?? null,
    });
  }
  for (const idea of sources.ideas) {
    const poi = idea.poiId === null ? undefined : curated.get(idea.poiId);
    all.push({
      id: idea.poiId ?? idea.id,
      poiId: idea.poiId,
      ideaId: idea.id,
      name: idea.name,
      category: idea.category,
      lat: idea.lat,
      lng: idea.lng,
      standing: 'saved',
      backerIds: idea.backerIds,
      dayNo: null,
      mustSee: poi?.mustSee ?? false,
      hours: poi?.hours ?? null,
      bestTime: poi?.bestTime ?? null,
    });
  }
  for (const poi of sources.curated) {
    if (sources.hiddenIds.has(poi.id)) continue;
    all.push({
      id: poi.id,
      poiId: poi.id,
      ideaId: null,
      name: poi.name,
      category: poi.category,
      lat: poi.lat,
      lng: poi.lng,
      standing: 'suggested',
      backerIds: [],
      dayNo: null,
      mustSee: poi.mustSee,
      hours: poi.hours,
      bestTime: poi.bestTime ?? null,
    });
  }
  // The strongest standing first, so the later copies of a place drop out.
  const byId = new Map<string, HubPlace>();
  for (const place of [...all].sort((a, b) => RANK[a.standing] - RANK[b.standing])) {
    if (place.poiId !== null && sources.hiddenIds.has(place.poiId) && place.standing !== 'plan') {
      continue;
    }
    if (!byId.has(place.id)) byId.set(place.id, place);
  }
  // Two rows are one place only within a category, so each category is folded on its own.
  const byCategory = new Map<string, HubPlace[]>();
  for (const place of byId.values()) {
    const bucket = byCategory.get(place.category) ?? [];
    bucket.push(place);
    byCategory.set(place.category, bucket);
  }
  const distinct = new Set<HubPlace>();
  for (const bucket of byCategory.values()) {
    for (const place of distinctPlaces(bucket, sources.destination ?? '')) distinct.add(place);
  }
  const kept = [...byId.values()].filter((place) => distinct.has(place));
  const results = sources.results;
  return results === null || results === undefined
    ? kept
    : kept.filter((place) => results.has(place.id));
}

/** The category chips: a few groups, each over the categories it holds. */
/* eslint-disable lingui/no-unlocalized-strings -- category keys, never copy. */
export const CATEGORY_GROUPS = {
  food: ['food', 'market'],
  temples: ['temple_shrine'],
  nature: ['nature'],
  beaches: ['beach'],
  museums: ['museum'],
  nightlife: ['nightlife'],
  shopping: ['shopping'],
  wellness: ['health'],
} as const satisfies Readonly<Record<string, readonly string[]>>;
/* eslint-enable lingui/no-unlocalized-strings */
export type CategoryGroup = keyof typeof CATEGORY_GROUPS;

export function categoryGroupOf(category: string): CategoryGroup | null {
  for (const [group, categories] of Object.entries(CATEGORY_GROUPS)) {
    if ((categories as readonly string[]).includes(category)) return group as CategoryGroup;
  }
  return null;
}

export function isCategoryGroup(value: string): value is CategoryGroup {
  return Object.hasOwn(CATEGORY_GROUPS, value);
}

/** One filter at a time: everything, a standing, or a category group. */
export type PlacesFilter = 'all' | 'saved' | 'plan' | CategoryGroup;

export function parseFilter(value: string | undefined): PlacesFilter {
  if (value === 'saved' || value === 'plan') return value;
  return value !== undefined && isCategoryGroup(value) ? value : 'all';
}

export function passesFilter(place: HubPlace, filter: PlacesFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'saved') return place.standing === 'saved';
  if (filter === 'plan') return place.standing === 'plan';
  return categoryGroupOf(place.category) === filter;
}

export interface PlaceCounts {
  readonly all: number;
  readonly saved: number;
  readonly plan: number;
  /** Groups with places, the fullest first. */
  readonly groups: readonly { readonly group: CategoryGroup; readonly count: number }[];
}

export function placeCounts(places: readonly HubPlace[]): PlaceCounts {
  const groups = new Map<CategoryGroup, number>();
  let saved = 0;
  let plan = 0;
  for (const place of places) {
    if (place.standing === 'saved') saved += 1;
    if (place.standing === 'plan') plan += 1;
    const group = categoryGroupOf(place.category);
    if (group !== null) groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  return {
    all: places.length,
    saved,
    plan,
    groups: [...groups.entries()]
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group)),
  };
}
