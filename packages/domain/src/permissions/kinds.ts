/**
 * The OS permissions the app asks for, one primer card or sheet each. Contacts and the dialer are
 * never listed: the app only uses the system pickers, which need no prompt. The photo library is
 * two kinds because the asks differ: add-only for "save as image" and postcards, read for album
 * auto-ingest.
 */
import { z } from 'zod';

export const PERMISSION_KINDS = [
  'notifications',
  'alarms',
  'location',
  'calendar',
  'camera',
  'microphone',
  'speech',
  'photos_add',
  'photos_read',
  'live_activities',
] as const;
export const permissionKindSchema = z.enum(PERMISSION_KINDS);
export type PermissionKind = z.infer<typeof permissionKindSchema>;

/**
 * Kinds the OS never prompts for from inside the app: the user flips them in system Settings
 * (Live Activities on iOS; exact alarms on Android go through a Settings intent, handled natively).
 */
export const SETTINGS_ONLY_KINDS: readonly PermissionKind[] = ['live_activities'];

/** Kinds asked together: speech recognition is never useful without the microphone. */
export const PERMISSION_COMPANIONS: Readonly<Partial<Record<PermissionKind, PermissionKind>>> = {
  microphone: 'speech',
};

export function isPermissionKind(value: unknown): value is PermissionKind {
  return permissionKindSchema.safeParse(value).success;
}
