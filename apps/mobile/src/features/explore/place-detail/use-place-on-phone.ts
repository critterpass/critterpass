/**
 * Add to plan reads the place from the phone. A place the page drew from the api (a search result
 * nobody recommends) is not there, so before the sheet opens it is saved to the trip's Ideas, which
 * brings it over; a refused save says so instead of opening an empty sheet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and toast ids, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';

import { saveIdeaCommand } from '../search/commands';

const HELD_SQL = `SELECT 1 AS held FROM pois WHERE id = ?1
  UNION ALL
  SELECT 1 FROM trip_ideas WHERE trip_id = ?2 AND poi_id = ?1 AND deleted_at IS NULL
  LIMIT 1`;

/** Runs `then` once the phone holds the place (at once when it already does). */
export function usePlaceOnPhone(
  tripId: string | null,
  placeId: string,
  name: string,
): (then: () => void) => void {
  const { send } = useCommand(saveIdeaCommand);
  const { db } = useLocalFirst();
  return useCallback(
    (then: () => void) => {
      if (tripId === null) {
        then();
        return;
      }
      void db
        .getAll<{ held: number }>(HELD_SQL, [placeId, tripId])
        .then(
          (rows) => rows.length > 0,
          () => true,
        )
        .then(async (held) => {
          if (held) {
            then();
            return;
          }
          const result = await send({
            idea_id: generateUuidV7(),
            trip_id: tripId,
            poi_id: placeId,
            source: 'search',
          });
          if (result.kind === 'rejected' || result.kind === 'unavailable') {
            toast.show({
              id: 'place-add-failed',
              title: t({
                id: 'explore.detail.addFailed',
                message: `Couldn’t add ${name}. Try again.`,
              }),
            });
            return;
          }
          then();
        });
    },
    [send, db, tripId, placeId, name],
  );
}
