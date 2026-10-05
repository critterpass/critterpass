/**
 * Save and hide from the places list: sends the command (queued when offline), shows the row's new
 * standing at once and offers undo in a short toast ("Tirta Empul saved · UNDO"). A place already
 * in the plan is not saved again: the toast says which day it is on.
 */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useCallback, useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { toast } from '@/motion';

import { PLACES_COMMANDS } from './commands';
import { markSavedOnce, updatePending, usePending } from './pending-store';
import { inPlanLine, shortName } from './places-copy';
import type { HubPlace } from './places-model';
import {
  actionCommand,
  overlayPending,
  settlePending,
  undoCommand,
  withoutPending,
  withPending,
  type CommandCall,
  type PendingAction,
  type SwipeAction,
} from './swipe-actions';

function toastFor(action: SwipeAction, fullName: string): string {
  const name = shortName(fullName);
  return action === 'save'
    ? t({ id: 'places.toast.savedShort', message: `${name} saved` })
    : t({ id: 'places.toast.hiddenShort', message: `${name} hidden for you` });
}

/** The trip's places with the saves and hides still on their way laid over them. */
export function usePendingPlaces(
  tripId: string | null,
  places: readonly HubPlace[],
  me: string | null,
): HubPlace[] {
  const pending = usePending(tripId);
  // Once the synced rows show an action, the overlay steps aside.
  return useMemo(
    () => overlayPending(places, settlePending(pending, places), me),
    [places, pending, me],
  );
}

export function useSwipeActions(
  tripId: string | null,
  places: readonly HubPlace[],
  me: string | null,
  /** A plan day's short weekday ("Tue"), for the already-planned toast. */
  weekdayOf?: (dayNo: number) => string | null,
) {
  const { commands } = useLocalFirst();
  const shown = usePendingPlaces(tripId, places, me);

  const send = useCallback(
    (call: CommandCall) => void commands.send(PLACES_COMMANDS[call.name], call.payload),
    [commands],
  );

  const act = useCallback(
    (place: HubPlace, action: SwipeAction) => {
      if (tripId === null || place.poiId === null) return;
      // A planned place is not saved a second time: say where it is.
      if (action === 'save' && place.standing === 'plan') {
        toast.show({
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
          id: `places-planned-${place.poiId}`,
          title: inPlanLine(
            place.dayNo,
            place.dayNo === null ? null : (weekdayOf?.(place.dayNo) ?? null),
          ),
        });
        return;
      }
      // Saving a place already saved changes nothing.
      if (action === 'save' && place.standing !== 'suggested') return;
      const entry: PendingAction = {
        action,
        poiId: place.poiId,
        ideaId: action === 'save' ? generateUuidV7() : null,
      };
      // Actions the synced rows already show leave the overlay as a new one joins.
      updatePending(tripId, (now) => withPending(settlePending(now, places), entry));
      if (action === 'save') markSavedOnce();
      send(actionCommand(tripId, entry));
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `places-${action}-${entry.poiId}`,
        title: toastFor(action, place.name),
        action: {
          label: t({ id: 'places.toast.undo', message: 'Undo' }),
          onPress: () => {
            updatePending(tripId, (now) => withoutPending(now, entry.poiId));
            const back = undoCommand(entry);
            if (back !== null) send(back);
          },
        },
      });
    },
    [send, tripId, places, weekdayOf],
  );

  return { places: shown, act };
}
