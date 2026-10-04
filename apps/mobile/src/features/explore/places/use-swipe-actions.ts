/**
 * Save and hide from the places list: sends the command (queued when offline), shows the row's new
 * standing at once and offers undo in a toast ("Tirta Empul is in Ideas. UNDO").
 */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { toast } from '@/motion';

import { PLACES_COMMANDS } from './commands';
import type { HubPlace } from './places-model';
import {
  actionCommand,
  overlayPending,
  settlePending,
  undoCommand,
  withoutPending,
  withPending,
  type CommandCall,
  type Pending,
  type PendingAction,
  type SwipeAction,
} from './swipe-actions';

function toastFor(action: SwipeAction, name: string): string {
  return action === 'save'
    ? t({ id: 'places.toast.saved', message: `${name} is in Ideas.` })
    : t({ id: 'places.toast.hidden', message: `${name} is hidden. Only you see this.` });
}

export function useSwipeActions(
  tripId: string | null,
  places: readonly HubPlace[],
  me: string | null,
) {
  const { commands } = useLocalFirst();
  const [pending, setPending] = useState<Pending>(new Map());

  const send = useCallback(
    (call: CommandCall) => void commands.send(PLACES_COMMANDS[call.name], call.payload),
    [commands],
  );

  const act = useCallback(
    (place: HubPlace, action: SwipeAction) => {
      if (tripId === null || place.poiId === null) return;
      // Saving a place already saved or planned changes nothing.
      if (action === 'save' && place.standing !== 'suggested') return;
      const entry: PendingAction = {
        action,
        poiId: place.poiId,
        ideaId: action === 'save' ? generateUuidV7() : null,
      };
      // Actions the synced rows already show leave the overlay as a new one joins.
      setPending((now) => withPending(settlePending(now, places), entry));
      send(actionCommand(tripId, entry));
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `places-${action}-${entry.poiId}`,
        title: toastFor(action, place.name),
        action: {
          label: t({ id: 'places.toast.undo', message: 'Undo' }),
          onPress: () => {
            setPending((now) => withoutPending(now, entry.poiId));
            const back = undoCommand(entry);
            if (back !== null) send(back);
          },
        },
      });
    },
    [send, tripId, places],
  );

  // Once the synced rows show an action, the overlay steps aside.
  const shown = useMemo(
    () => overlayPending(places, settlePending(pending, places), me),
    [places, pending, me],
  );
  return { places: shown, act };
}
