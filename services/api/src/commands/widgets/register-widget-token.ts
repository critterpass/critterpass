/**
 * `register_widget_token` (docs/api-contracts.md §4.1): the widget extension's push token for this
 * install. One per (device, widget kind); a new token replaces the old one and clears any
 * invalid mark. Only for the caller's own install; written as the system, because a token that
 * moves to another install must detach from its previous owner.
 */
import { registerWidgetTokenPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireOwnDevice } from '../live-activities/shared';

export const registerWidgetTokenCommand = defineCommand({
  name: 'register_widget_token',
  v: 1,
  schema: registerWidgetTokenPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, _payload, ctx) => {
    await asSystemRole(tx, () => requireOwnDevice(tx, ctx.device.id, ctx.uid));
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      // The same token on another install (a restored backup) belongs to this one now.
      await tx.query('DELETE FROM widget_push_tokens WHERE token = $1 AND device_id <> $2', [
        payload.token,
        ctx.device.id,
      ]);
      await tx.query(
        `INSERT INTO widget_push_tokens (device_id, user_id, widget_kind, token, env)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_id, widget_kind) DO UPDATE
           SET token = EXCLUDED.token, env = EXCLUDED.env, user_id = EXCLUDED.user_id,
               invalid_at = NULL, invalid_reason = NULL`,
        [ctx.device.id, ctx.uid, payload.widget_kind, payload.token, payload.apns_env],
      );
      return { widget_kind: payload.widget_kind };
    }),
});
