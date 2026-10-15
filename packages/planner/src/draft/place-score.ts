/**
 * What lifts a place up the candidate lists beyond being a must-see: how well the researchers
 * found it known, and how much it suits the crew's tastes.
 */
import type { DraftPoi } from './types';

/** Taste tag → place categories and tags it points at. */
const TASTE_MATCH: Readonly<Record<string, readonly string[]>> = {
  temples: ['temple_shrine'],
  culture: ['temple_shrine', 'museum'],
  history: ['museum', 'temple_shrine', 'history'],
  museums: ['museum'],
  markets: ['market'],
  shopping: ['shopping', 'market'],
  nature: ['nature'],
  hiking: ['nature', 'hiking'],
  beach: ['beach'],
  nightlife: ['nightlife'],
  photo_spots: ['photo_spot', 'viewpoint'],
  local_life: ['market', 'local_life'],
  wellness: ['wellness', 'onsen'],
  adventure: ['adventure', 'nature'],
  street_food: ['street_food'],
  sit_down_dining: ['sit_down'],
  coffee: ['coffee', 'cafe'],
};

/**
 * How many of the crew's taste tags the place suits: by its kind, or by a taste tag it carries
 * itself (the researchers tag curated places with the tastes they suit).
 */
export function tasteScore(poi: DraftPoi, tastes: Readonly<Record<string, number>>): number {
  let score = 0;
  for (const [tag, count] of Object.entries(tastes)) {
    const targets = TASTE_MATCH[tag] ?? [];
    if (
      poi.tags.includes(tag) ||
      targets.includes(poi.category) ||
      poi.tags.some((t) => targets.includes(t))
    )
      score += count;
  }
  return score;
}

/** Points for how well known the researchers found a place: its standing, and the pages holding it. */
const PROMINENCE_POINTS: Readonly<Record<string, number>> = {
  icon: 4,
  popular: 2,
  local_favourite: 1,
};
const MAX_BLOG_POINTS = 4;

export function fameScore(poi: DraftPoi): number {
  return (
    (poi.prominence == null ? 0 : (PROMINENCE_POINTS[poi.prominence] ?? 0)) +
    Math.min(MAX_BLOG_POINTS, poi.blogCount ?? 0)
  );
}
