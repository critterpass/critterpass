/**
 * The person's ping settings on this phone: the synced row read locally (so the screen opens with
 * no signal) with their own unsynced changes on top. A change shows at once and waits in the
 * offline queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import { useCallback, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
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
  // What this screen changed, shown until the server's row says the same.
  const [edits, setEdits] = useState<Partial<PingPrefs>>({});
  const prefs = { ...prefsFromRow(rows[0]), ...edits };

  const change = useCallback(
    (next: Partial<PingPrefs>) => {
      const payload = payloadFor(next, prefs);
      if (Object.keys(payload).length === 0) return;
      setEdits((previous) => ({ ...previous, ...next }));
      void send(payload).catch(() => {
        // Refused or unsendable: the queue reports it; the screen falls back to the stored row.
        setEdits((previous) => {
          const rest = { ...previous };
          for (const key of Object.keys(next) as (keyof PingPrefs)[]) delete rest[key];
          return rest;
        });
      });
    },
    // `prefs` is rebuilt every render; its fields only matter for the quiet-hours pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, prefs.quietFrom, prefs.quietTo],
  );

  return { prefs, loaded, change };
}
