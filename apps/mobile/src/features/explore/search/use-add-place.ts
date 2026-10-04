/**
 * A search row's +: opens Add to plan for the place. The sheet reads the place from the phone, so
 * a place only the server holds is saved to the trip's Ideas first (a saved place syncs over);
 * when that save is refused the row says so instead of opening an empty sheet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and toast ids, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { toast } from '@/motion/island-toast';

import { saveIdeaCommand } from './commands';
import { matchPlaceRef } from './search-navigation';

export interface AddTarget {
  readonly poiId: string;
  readonly name: string;
}

export function useAddPlace(input: {
  readonly tripId: string;
  readonly destinationId: string | null;
  /** The day the search was opened for: the sheet opens on it. */
  readonly dayId?: string | undefined;
}): (target: AddTarget) => void {
  const { tripId, destinationId, dayId } = input;
  const save = useCommand(saveIdeaCommand);
  const { send } = save;
  const { db } = useLocalFirst();
  return useCallback(
    (target: AddTarget) => {
      const open = () => {
        const href = matchPlaceRef(tripId, destinationId, { poiId: target.poiId }, 'add', dayId);
        if (href !== undefined) router.push(href);
      };
      const onPhone = db
        .getAll<{ id: string }>('SELECT id FROM pois WHERE id = ? LIMIT 1', [target.poiId])
        .then(
          (rows) => rows.length > 0,
          () => false,
        );
      void onPhone.then(async (held) => {
        if (held) {
          open();
          return;
        }
        const result = await send({
          idea_id: generateUuidV7(),
          trip_id: tripId,
          poi_id: target.poiId,
          source: 'search',
        });
        if (result.kind === 'rejected' || result.kind === 'unavailable') {
          const name = target.name;
          toast.show({
            id: 'search-add-failed',
            title:
              name === ''
                ? t({
                    id: 'search.add.failedPlace',
                    message: 'Couldn’t add that place. Try again.',
                  })
                : t({ id: 'search.add.failed', message: `Couldn’t add ${name}. Try again.` }),
          });
          return;
        }
        open();
      });
    },
    [send, db, tripId, destinationId, dayId],
  );
}
