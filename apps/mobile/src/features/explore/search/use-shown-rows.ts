/**
 * Search rows under the names the reader sees: one row per place, each titled with its name in the
 * reader's language where the destination's own is hers (`@cp/domain` `shownPlaceName`), the other
 * name kept as `nameLocal` so it still matches and can show on the second line.
 */
import { useMemo } from 'react';

import type { PlaceCandidate } from '@/data/places/match-places';
import { usePlaceNamer } from '@/data/places/use-shown-names';

import { onePerPlace } from './search-rows';

export function useShownRows<T extends PlaceCandidate>(
  rows: readonly T[],
  destinationId: string | null,
): T[] {
  const namer = usePlaceNamer(destinationId);
  return useMemo(
    () =>
      onePerPlace(rows).map((row) => ({
        ...row,
        name: namer.name(row),
        nameLocal: namer.other(row),
      })),
    [rows, namer],
  );
}
