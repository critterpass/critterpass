/**
 * `set_app_icon` (3n-5, docs/api-contracts.md §4.1): records the icon the device switched to, for
 * the server audit and to restore it on a reinstall; the device's OS state stays the source of
 * truth for what is actually showing. Free styles for everyone, STAMP with Pass+
 * (`ENTITLEMENT_REQUIRED`), earned icons once unlocked (`FORBIDDEN {reason: icon_locked}`: none of
 * them can be bought). Choosing an earned icon marks its NEW badge seen.
 */
import { appendDomainEvent } from '@cp/db';
import {
  appIconDenial,
  appIconEntry,
  appIconKey,
  DomainError,
  setAppIconPayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { entitle } from '../../entitlements';
import { defineCommand } from '../_framework/define-command';

export interface SetAppIconResult {
  readonly icon: string;
  readonly changed: boolean;
}

export const setAppIconCommand = defineCommand({
  name: 'set_app_icon',
  v: 1,
  schema: setAppIconPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    if (appIconEntry(payload.icon_id).gate !== 'earned') return;
    const { rows } = await tx.query<{ icon_key: string }>(
      'SELECT icon_key FROM app_icon_unlocks WHERE user_id = $1',
      [ctx.uid],
    );
    const unlocked = new Set(rows.map((row) => row.icon_key));
    if (appIconDenial(payload.icon_id, { passPlus: false, unlocked }) === 'not_unlocked') {
      throw new DomainError('FORBIDDEN', { reason: 'icon_locked', icon_id: payload.icon_id });
    }
  },
  entitle: async (tx, payload, ctx) => {
    if (appIconEntry(payload.icon_id).gate !== 'pass_plus') return;
    await entitle(
      tx,
      { uid: ctx.uid, deviceTz: ctx.device.tz },
      { kind: 'capability', key: 'icon_styles_all' },
    );
  },
  handle: async (tx, payload, ctx): Promise<SetAppIconResult> => {
    const icon = appIconKey(payload.icon_id, payload.appearance);
    const updated = await tx.query(
      'UPDATE users SET app_icon = $2 WHERE id = $1 AND app_icon IS DISTINCT FROM $2',
      [ctx.uid, icon],
    );
    const changed = (updated.rowCount ?? 0) > 0;
    if (appIconEntry(payload.icon_id).gate === 'earned') {
      await asSystemRole(tx, () =>
        tx.query(
          `UPDATE app_icon_unlocks SET seen_at = now()
            WHERE user_id = $1 AND icon_key = $2 AND seen_at IS NULL`,
          [ctx.uid, payload.icon_id],
        ),
      );
    }
    if (changed) {
      await appendDomainEvent(tx, {
        type: 'profile.icon_changed',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, icon_id: payload.icon_id },
      });
    }
    return { icon, changed };
  },
});
