/**
 * `update_device_permissions {perms}` (docs/api-contracts.md §4.1): the app mirrors its OS
 * permission state whenever it changes (checked on every foreground). The server keeps it on the
 * caller's `devices` row (`permission_state`, plus the Live Activity columns the LA gate reads) to
 * route push vs inbox, gate Live Activity starts and show crewmates a derived capability such as
 * "alarm off" — never the raw list. An unchanged mirror is a no-op; a changed one emits
 * `device.permissions_changed` with the derived capability only.
 */
import { appendDomainEvent } from '@cp/db';
import {
  deriveCapabilities,
  DomainError,
  devicePermissionStateSchema,
  permissionStatesEqual,
  updateDevicePermissionsPayloadSchema,
  type DevicePermissionState,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export interface UpdateDevicePermissionsResult {
  readonly device_id: string;
  readonly changed: boolean;
}

export const updateDevicePermissionsCommand = defineCommand({
  name: 'update_device_permissions',
  v: 1,
  schema: updateDevicePermissionsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<UpdateDevicePermissionsResult> => {
    const deviceId = ctx.device.id.toLowerCase();
    // RLS limits this to the caller's own install; another user's device reads as missing.
    const { rows } = await tx.query<{ permission_state: unknown }>(
      'SELECT permission_state FROM devices WHERE id::text = $1 AND user_id = $2 FOR UPDATE',
      [deviceId, ctx.uid],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'device_not_registered' });

    const previous = devicePermissionStateSchema.safeParse(row.permission_state);
    const before: DevicePermissionState = previous.success ? previous.data : {};
    const next = payload.perms;
    if (previous.success && permissionStatesEqual(before, next)) {
      return { device_id: deviceId, changed: false };
    }

    await tx.query(
      `UPDATE devices SET permission_state = $2, la_enabled = coalesce($3, la_enabled),
         la_frequent = coalesce($4, la_frequent)
       WHERE id::text = $1`,
      [deviceId, JSON.stringify(next), next.la_enabled ?? null, next.la_frequent ?? null],
    );

    const capabilities = deriveCapabilities(next);
    const beforeCapabilities = deriveCapabilities(before);
    if (JSON.stringify(capabilities) !== JSON.stringify(beforeCapabilities)) {
      await appendDomainEvent(tx, {
        type: 'device.permissions_changed',
        aggregateKind: 'device',
        aggregateId: deviceId,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          device_id: deviceId,
          push: capabilities.push,
          can_ring: capabilities.canRing,
          live_activities: capabilities.liveActivities,
          encounters: capabilities.encounters,
        },
      });
    }
    return { device_id: deviceId, changed: true };
  },
});
