/**
 * `set_settings` (3n-2, 3n-6, 3n-7, 3n-8; docs/api-contracts.md §4.1): patches the caller's synced
 * settings. Only whitelisted keys are accepted (`settingsPatchSchema`); `audio` is merged key by
 * key, so two devices changing different sound toggles offline never undo each other.
 */
import { appendDomainEvent } from '@cp/db';
import {
  SETTINGS_COLUMNS,
  setSettingsPayloadSchema,
  type SettingsColumn,
  type SettingsPatch,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export interface SetSettingsResult {
  readonly changed: readonly SettingsColumn[];
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export const setSettingsCommand = defineCommand({
  name: 'set_settings',
  v: 1,
  schema: setSettingsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<SetSettingsResult> => {
    await tx.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [
      ctx.uid,
    ]);
    const { rows } = await tx.query<Record<SettingsColumn, unknown>>(
      `SELECT ${SETTINGS_COLUMNS.join(', ')} FROM user_settings WHERE user_id = $1 FOR UPDATE`,
      [ctx.uid],
    );
    const current: Partial<Record<SettingsColumn, unknown>> = rows[0] ?? {};
    const patch: SettingsPatch = payload.patch;
    const changed: SettingsColumn[] = [];
    const sets: string[] = [];
    const values: unknown[] = [ctx.uid];

    for (const column of SETTINGS_COLUMNS) {
      const next = patch[column];
      if (next === undefined) continue;
      if (column === 'audio') {
        const stored = (current.audio ?? {}) as Record<string, unknown>;
        const merged = { ...stored, ...(next as Record<string, unknown>) };
        if (sameValue(stored, merged)) continue;
        values.push(JSON.stringify(next));
        sets.push(`audio = audio || $${values.length}::jsonb`);
      } else {
        if (sameValue(current[column], next)) continue;
        values.push(next);
        sets.push(`${column} = $${values.length}`);
      }
      changed.push(column);
    }

    if (sets.length > 0) {
      await tx.query(`UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = $1`, values);
      await appendDomainEvent(tx, {
        type: 'settings.changed',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, keys: changed },
      });
    }
    return { changed };
  },
});
