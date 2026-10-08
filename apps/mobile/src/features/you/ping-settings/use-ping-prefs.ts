/**
 * The person's ping settings on this phone: the synced row read locally (so the screen opens with
 * no signal) with their own unsynced changes on top. A change shows at once and waits in the
 * offline queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import { useCallback, useMemo } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { dropPendingEdits, putPendingEdits, usePendingEdits } from '../data/pending-edits';
import {
  payloadFor,
  PREFS_SQL,
  PREFS_TABLES,
  prefsFromRow,
  type PingPrefs,
  type PingPrefsRow,
  type SetNotificationPrefsPayload,
} from './ping-prefs';

export const setNotificationPrefsCommand = defineClientCommand<SetNotificationPrefsPayload>({
  name: 'set_notification_prefs',
  offline: true,
});

const PENDING_PINGS = 'pings';

export interface PingPrefsControls {
  readonly prefs: PingPrefs;
  readonly loaded: boolean;
  readonly change: (change: Partial<PingPrefs>) => void;
}

/** The person's ping settings, with their own unsynced changes on top. */
export function usePingPrefs(): PingPrefsControls {
  const uid = useOwnerUid();
  const { rows, loaded } = useLiveRows<PingPrefsRow>(
    PREFS_SQL,
    uid === null ? null : [uid],
    PREFS_TABLES,
  );
  const { send } = useCommand(setNotificationPrefsCommand);
  // What this phone changed (here or in Settings), shown until the synced row says the same.
  const row = rows[0];
  const stored = useMemo(() => prefsFromRow(row), [row]);
  const edits = usePendingEdits<PingPrefs>(PENDING_PINGS, loaded ? stored : null);
  const prefs = { ...stored, ...edits };

  const change = useCallback(
    (next: Partial<PingPrefs>) => {
      const payload = payloadFor(next, prefs);
      if (Object.keys(payload).length === 0) return;
      const keys = Object.keys(next) as (keyof PingPrefs)[];
      putPendingEdits<PingPrefs>(PENDING_PINGS, next);
      // Refused or unsendable: the screen falls back to the stored row.
      const undo = () => dropPendingEdits<PingPrefs>(PENDING_PINGS, keys);
      void send(payload).then((result) => {
        if (result.kind === 'rejected') undo();
      }, undo);
    },
    // `prefs` is rebuilt every render; its fields only matter for the quiet-hours pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, prefs.quietFrom, prefs.quietTo],
  );

  return { prefs, loaded, change };
}
