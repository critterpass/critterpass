/**
 * The words on a place's page that are built from facts: the tags over the photo and the one-line
 * summary under the name (category, admission, whether it is open, the walk from the stay).
 */
import { t } from '@lingui/core/macro';

import { categoryLabel } from './category';
import type { OpenState } from './place-model';

export interface PlaceTagFacts {
  readonly guideName: string;
  /** The guide's own pick (a curated must-see). */
  readonly guidePick: boolean;
  /** The crewmate whose must-do this is, by name. */
  readonly mustDoOwner: string | null;
}

export function placeTags(facts: PlaceTagFacts): string[] {
  const tags: string[] = [];
  const { guideName, mustDoOwner } = facts;
  if (facts.guidePick) {
    tags.push(t({ id: 'explore.place.guidePick', message: `${guideName}'s pick` }));
  }
  if (mustDoOwner !== null && mustDoOwner !== '') {
    tags.push(t({ id: 'explore.place.mustDo', message: `Must-do · ${mustDoOwner}` }));
  }
  return tags;
}

export interface PlaceMetaFacts {
  readonly category: string;
  /** 0 is free, 1–4 the price tier; unknown says nothing. */
  readonly priceLevel: number | null;
  readonly open: OpenState;
  /** A place that has shut for good says so instead of its hours. */
  readonly closedPermanently?: boolean;
  /** Minutes on foot from the trip's stay, when there is a trip with one. */
  readonly stayMinutes: number | null;
}

export function placeMeta(facts: PlaceMetaFacts): string[] {
  const parts = [categoryLabel(facts.category)];
  if (facts.priceLevel === 0) parts.push(t({ id: 'explore.place.free', message: 'free' }));
  else if (facts.priceLevel !== null && facts.priceLevel >= 1 && facts.priceLevel <= 4) {
    parts.push('$'.repeat(Math.round(facts.priceLevel)));
  }
  if (facts.closedPermanently === true) {
    parts.push(t({ id: 'explore.place.closedForGood', message: 'closed permanently' }));
  } else if (facts.open === 'always')
    parts.push(t({ id: 'explore.place.open24', message: 'open 24h' }));
  else if (facts.open === 'open')
    parts.push(t({ id: 'explore.place.openNow', message: 'open now' }));
  else if (facts.open === 'closed')
    parts.push(t({ id: 'explore.place.closedNow', message: 'closed now' }));
  if (facts.stayMinutes !== null) {
    const minutes = Math.max(1, Math.round(facts.stayMinutes));
    parts.push(t({ id: 'explore.place.fromStay', message: `${minutes} min from your stay` }));
  }
  return parts;
}
