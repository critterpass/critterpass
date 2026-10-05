/**
 * The look of a released critter's guide row: its accent from the critter's own colours (or the
 * token colour of a guide that has one) and the named colour nearest it.
 */
import { guideLook, guideSlug } from '@cp/critter-art/guides';
import type { GuideLookFor } from '@cp/db';

export const critterGuideLook: GuideLookFor = (critter) =>
  guideLook(guideSlug(critter.name), critter.colours);
