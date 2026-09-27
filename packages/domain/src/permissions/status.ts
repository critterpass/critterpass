/**
 * One normalized permission status for both OSes, the location detail on top of it, and the
 * device permission mirror the app sends with `update_device_permissions`. The server stores the
 * mirror on `devices.permission_state` and only ever shows other users a derived capability
 * ("alarm off"), never the raw list.
 */
import { z } from 'zod';

import { PERMISSION_KINDS, type PermissionKind } from './kinds';

export const PERMISSION_STATUSES = [
  'not_determined',
  'denied',
  'restricted',
  'limited',
  'provisional',
  'granted',
] as const;
export const permissionStatusSchema = z.enum(PERMISSION_STATUSES);
export type PermissionStatus = z.infer<typeof permissionStatusSchema>;

export const LOCATION_LEVELS = ['none', 'wiu', 'always'] as const;
export const locationLevelSchema = z.enum(LOCATION_LEVELS);
export type LocationLevel = z.infer<typeof locationLevelSchema>;

/** What one kind reports: the status plus whether the OS would still show its prompt. */
export interface PermissionState {
  readonly status: PermissionStatus;
  readonly canAskAgain: boolean;
}

/** Statuses a feature can work with (limited photos, provisional notifications, approximate location). */
export function isUsable(status: PermissionStatus): boolean {
  return status === 'granted' || status === 'limited' || status === 'provisional';
}

const statusEntries = Object.fromEntries(
  PERMISSION_KINDS.map((kind) => [kind, permissionStatusSchema.optional()]),
) as Record<PermissionKind, z.ZodOptional<typeof permissionStatusSchema>>;

/** `update_device_permissions` payload `perms`; every field optional so older builds still parse. */
export const devicePermissionStateSchema = z
  .object({
    ...statusEntries,
    location_level: locationLevelSchema.optional(),
    location_precise: z.boolean().optional(),
    notifications_time_sensitive: z.boolean().optional(),
    /** Android: `canScheduleExactAlarms()`; iOS AlarmKit is the `alarms` status itself. */
    exact_alarm: z.boolean().optional(),
    /** Android 14+: `canUseFullScreenIntent()`. */
    full_screen_intent: z.boolean().optional(),
    la_enabled: z.boolean().optional(),
    la_frequent: z.boolean().optional(),
  })
  .strict();
export type DevicePermissionState = z.infer<typeof devicePermissionStateSchema>;

export const updateDevicePermissionsPayloadSchema = z.object({
  perms: devicePermissionStateSchema,
});
export type UpdateDevicePermissionsPayload = z.infer<typeof updateDevicePermissionsPayloadSchema>;

/** Stable key order so two equal mirrors always compare (and hash) the same. */
export function canonicalPermissionState(state: DevicePermissionState): DevicePermissionState {
  const out: Record<string, unknown> = {};
  const entries: Record<string, unknown> = state;
  for (const key of Object.keys(entries).sort()) {
    const value = entries[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function permissionStatesEqual(a: DevicePermissionState, b: DevicePermissionState): boolean {
  return (
    JSON.stringify(canonicalPermissionState(a)) === JSON.stringify(canonicalPermissionState(b))
  );
}

/** How the server may reach this device, and what crewmates may be told about it. */
export interface DeviceCapabilities {
  /** `alert` = banners and sounds; `quiet` = provisional (Notification Center only); `inbox` = none. */
  readonly push: 'alert' | 'quiet' | 'inbox';
  /** A leave-by alarm can ring (AlarmKit or an exact alarm); false = high-priority notification. */
  readonly canRing: boolean;
  readonly liveActivities: boolean;
  /** Encounters in the background (`always`), only while the trip-day session runs, or never. */
  readonly encounters: 'background' | 'session' | 'off';
}

export function deriveCapabilities(state: DevicePermissionState): DeviceCapabilities {
  const notif = state.notifications;
  const push = notif === 'granted' ? 'alert' : notif === 'provisional' ? 'quiet' : 'inbox';
  const alarmGranted = state.alarms === 'granted';
  const canRing = alarmGranted || state.exact_alarm === true;
  const level = state.location_level ?? 'none';
  const locationOk = state.location !== undefined && isUsable(state.location);
  const encounters =
    !locationOk || level === 'none' ? 'off' : level === 'always' ? 'background' : 'session';
  return { push, canRing, liveActivities: state.la_enabled === true, encounters };
}
