/**
 * The + on a pick saves the place to the trip's Ideas in one tap (`save_idea`, queued offline),
 * with the toast "{place} is in Ideas."; the card shows ♥ SAVED once the idea row is on the phone.
 */
import { generateUuidV7 } from '@cp/domain';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';

import { saveIdeaCommand } from '../place-detail/commands';
import * as copy from './copy';

export function usePickSave(tripId: string): (place: { id: string; name: string }) => void {
  const { send } = useCommand(saveIdeaCommand);
  return useCallback(
    (place) => {
      void send({ idea_id: generateUuidV7(), trip_id: tripId, poi_id: place.id, source: 'save' });
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `explore-trip-saved-${place.id}`,
        title: copy.pickSavedToast(place.name),
      });
    },
    [send, tripId],
  );
}
