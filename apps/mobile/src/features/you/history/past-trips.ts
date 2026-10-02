/**
 * Self-reported past trips: the synced rows with this phone's own unsynced adds and removals on
 * top, so a trip added with no signal shows on the profile and in the stamps list at once and
 * waits in the offline queue. A command that cannot be queued drops its change again.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { generateUuidV7, type AddPastTripPayload, type RemovePastTripPayload } from '@cp/domain';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { PAST_TRIPS_SQL, PAST_TRIPS_TABLES, type PastTripRow } from '../profile/profile-queries';
import { mergePastTrips, type PendingPastTrips } from './pending-past-trips';

export const addPastTripCommand = defineClientCommand<AddPastTripPayload>({
  name: 'add_past_trip',
  offline: true,
});

export const removePastTripCommand = defineClientCommand<RemovePastTripPayload>({
  name: 'remove_past_trip',
  offline: true,
});

const EMPTY: PendingPastTrips = { added: [], removed: new Set() };
let pending: PendingPastTrips = EMPTY;
const listeners = new Set<() => void>();

function update(next: PendingPastTrips): void {
  pending = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `YYYY-MM` for the command; the row keeps the first of the month, as the server stores it. */
export interface PastTripDraft {
  readonly country: string;
  readonly month: string;
}

export function usePastTrips(): {
  readonly rows: readonly PastTripRow[];
  readonly loaded: boolean;
  readonly add: (draft: PastTripDraft) => string;
  readonly remove: (id: string) => void;
} {
  const uid = useOwnerUid();
  const synced = useLiveRows<PastTripRow>(
    PAST_TRIPS_SQL,
    uid === null ? null : [uid],
    PAST_TRIPS_TABLES,
  );
  const local = useSyncExternalStore(subscribe, () => pending);
  const { send: sendAdd } = useCommand(addPastTripCommand);
  const { send: sendRemove } = useCommand(removePastTripCommand);
  const rows = useMemo(() => mergePastTrips(synced.rows, local), [synced.rows, local]);

  const add = useCallback(
    (draft: PastTripDraft): string => {
      const id = generateUuidV7();
      const row: PastTripRow = {
        id,
        country: draft.country,
        month: `${draft.month}-01`,
        place_id: null,
      };
      update({ ...pending, added: [...pending.added, row] });
      void sendAdd({
        past_trip_id: id,
        place_id: null,
        country: draft.country,
        month: draft.month,
      }).catch(() => update({ ...pending, added: pending.added.filter((r) => r.id !== id) }));
      return id;
    },
    [sendAdd],
  );

  const remove = useCallback(
    (id: string) => {
      update({ ...pending, removed: new Set([...pending.removed, id]) });
      void sendRemove({ past_trip_id: id }).catch(() => {
        const removed = new Set(pending.removed);
        removed.delete(id);
        update({ ...pending, removed });
      });
    },
    [sendRemove],
  );

  return { rows, loaded: synced.loaded, add, remove };
}
