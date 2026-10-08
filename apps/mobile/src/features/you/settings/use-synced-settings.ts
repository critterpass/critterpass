/**
 * The account's synced settings on this phone: the `user_settings` row read locally (so Settings
 * opens with no signal) with this phone's unsynced changes on top (`data/pending-edits`). A change shows at once, waits
 * in the offline queue as `set_settings`, and reaches the person's other phones once it lands.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import type { SetSettingsPayload } from '@cp/domain';
import { useMemo } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { dropPendingEdits, putPendingEdits, usePendingEdits } from '../data/pending-edits';
import {
  settingsFromRow,
  settingsPatch,
  SYNCED_SETTINGS_SQL,
  SYNCED_SETTINGS_TABLES,
  type SyncedSettings,
  type SyncedSettingsRow,
} from './synced-settings';

export const setSettingsCommand = defineClientCommand<SetSettingsPayload>({
  name: 'set_settings',
  offline: true,
});

const PENDING_SETTINGS = 'settings';

export interface SyncedSettingsControls {
  readonly settings: SyncedSettings;
  readonly change: (change: Partial<SyncedSettings>) => void;
}

export function useSyncedSettings(): SyncedSettingsControls {
  const uid = useOwnerUid();
  const { rows, loaded } = useLiveRows<SyncedSettingsRow>(
    SYNCED_SETTINGS_SQL,
    uid === null ? null : [uid],
    SYNCED_SETTINGS_TABLES,
  );
  const { send } = useCommand(setSettingsCommand);
  const row = rows[0];
  const stored = useMemo(() => settingsFromRow(row), [row]);
  const edits = usePendingEdits<SyncedSettings>(PENDING_SETTINGS, loaded ? stored : null);
  const settings = { ...stored, ...edits };

  const change = (next: Partial<SyncedSettings>) => {
    const patch = settingsPatch(next, settings);
    if (patch === null) return;
    const keys = Object.keys(next) as (keyof SyncedSettings)[];
    putPendingEdits<SyncedSettings>(PENDING_SETTINGS, next);
    // Could not be queued, or the server said no: fall back to the stored row.
    const undo = () => dropPendingEdits<SyncedSettings>(PENDING_SETTINGS, keys);
    void send({ patch }).then((result) => {
      if (result.kind === 'rejected') undo();
    }, undo);
  };

  return { settings, change };
}
