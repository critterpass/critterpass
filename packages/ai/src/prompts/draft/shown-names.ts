/**
 * The draft's names for places, by the shared rule (`@cp/domain` `shownName`): an organiser who
 * reads the destination's language sees the local name, anyone else the first.
 */
import { readsLocalNames as reads, shownName as shown } from '@cp/domain';
import type { DraftPoi } from '@cp/planner';

import type { DraftPlanInput } from './context';

type Reader = Pick<DraftPlanInput, 'locale' | 'destinationLanguages'>;

/** Whether the organiser reads the destination's own language. */
export function readsLocalNames(input: Reader): boolean {
  return reads(input.locale, input.destinationLanguages);
}

/** The name `poi` is shown under to this draft's reader. */
export function shownName(input: Reader, poi: Pick<DraftPoi, 'name' | 'nameLocal'>): string {
  return shown(poi, readsLocalNames(input));
}
