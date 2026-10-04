/**
 * Every dex critter is the guide of its own city. These are the facts a guide is known by before
 * anything is written for it: the critter's designed name, its species, its city and country, and
 * the colours it is drawn in (the hand-drawn kinds carry none).
 */
import { critters } from '../data/critters';
import { isGuideSpec } from '../data/types';
import { guideSlug } from './fold';

export interface GuideFacts {
  /** The critter's dex key, `cp-###`. */
  readonly key: string;
  readonly slug: string;
  readonly name: string;
  readonly species: string;
  readonly city: string;
  readonly country: string;
  readonly colours: readonly string[] | null;
}

export const GUIDE_FACTS: readonly GuideFacts[] = critters.map((critter) => ({
  key: critter.id,
  slug: guideSlug(critter.name),
  name: critter.name,
  species: critter.species,
  city: critter.city,
  country: critter.place,
  colours: isGuideSpec(critter.spec) ? null : critter.spec.c,
}));

const BY_SLUG = new Map(GUIDE_FACTS.map((facts) => [facts.slug, facts]));
const BY_KEY = new Map(GUIDE_FACTS.map((facts) => [facts.key, facts]));

export function guideFactsBySlug(slug: string): GuideFacts | undefined {
  return BY_SLUG.get(slug);
}

export function guideFactsByKey(key: string): GuideFacts | undefined {
  return BY_KEY.get(key);
}
