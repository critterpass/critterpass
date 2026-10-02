/**
 * The account's synced settings on this phone: the `user_settings` row read locally (so Settings
 * opens with no signal) with this screen's unsynced changes on top. A change shows at once, waits
 * in the offline queue as `set_settings`, and reaches the person's other phones once it lands.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name, never copy. */
import type { SetSettingsPayload } from '@cp/domain';
import { useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
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

export interface SyncedSettingsControls {
  readonly settings: SyncedSettings;
  readonly change: (change: Partial<SyncedSettings>) => void;
}

export function useSyncedSettings(): SyncedSettingsControls {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<SyncedSettingsRow>(
    SYNCED_SETTINGS_SQL,
    uid === null ? null : [uid],
    SYNCED_SETTINGS_TABLES,
  );
  const { send } = useCommand(setSettingsCommand);
  const [edits, setEdits] = useState<Partial<SyncedSettings>>({});
  const settings = { ...settingsFromRow(rows[0]), ...edits };

  const change = (next: Partial<SyncedSettings>) => {
    const patch = settingsPatch(next, settings);
    if (patch === null) return;
    setEdits((previous) => ({ ...previous, ...next }));
    void send({ patch }).catch(() => {
      // Could not be queued: fall back to the stored row.
      setEdits((previous) => {
        const rest = { ...previous };
        for (const key of Object.keys(next) as (keyof SyncedSettings)[]) delete rest[key];
        return rest;
      });
    });
  };

  return { settings, change };
}
