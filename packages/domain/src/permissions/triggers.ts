/**
 * The moments a feature may ask for a permission. Every ask shows the same primer card as a sheet
 * first; the OS prompt fires only when the user flips its toggle on. `onboarding` is the 3a-9
 * primer screen, where every card starts off and nothing is pre-ticked.
 */
import { z } from 'zod';

import type { PermissionKind } from './kinds';

export const PERMISSION_TRIGGERS = [
  'onboarding',
  'settings',
  'first_vote',
  'date_finding',
  'trip_start',
  'landing',
  'first_encounter',
  'real_photo',
  'voice',
  'save_image',
  'album_ingest',
  'first_leave_by',
  'always_upgrade',
] as const;
export const permissionTriggerSchema = z.enum(PERMISSION_TRIGGERS);
export type PermissionTrigger = z.infer<typeof permissionTriggerSchema>;

export interface TriggerSpec {
  readonly kind: PermissionKind;
  /** User-initiated surfaces (onboarding, Settings) ignore the re-ask window. */
  readonly userInitiated: boolean;
}

export const TRIGGER_CATALOGUE: Readonly<
  Record<Exclude<PermissionTrigger, 'onboarding' | 'settings'>, TriggerSpec>
> = {
  first_vote: { kind: 'notifications', userInitiated: false },
  date_finding: { kind: 'calendar', userInitiated: false },
  trip_start: { kind: 'location', userInitiated: false },
  landing: { kind: 'location', userInitiated: false },
  first_encounter: { kind: 'location', userInitiated: false },
  real_photo: { kind: 'camera', userInitiated: true },
  voice: { kind: 'microphone', userInitiated: true },
  save_image: { kind: 'photos_add', userInitiated: true },
  album_ingest: { kind: 'photos_read', userInitiated: false },
  first_leave_by: { kind: 'alarms', userInitiated: false },
  // The Always upgrade, offered after a first successful encounter or turning on the crew map.
  always_upgrade: { kind: 'location', userInitiated: false },
};

/** Whether a trigger was started by the user (a tap on the feature), not by the app. */
export function isUserInitiated(trigger: PermissionTrigger): boolean {
  if (trigger === 'onboarding' || trigger === 'settings') return true;
  return TRIGGER_CATALOGUE[trigger].userInitiated;
}

/** The permission kind a just-in-time trigger asks for; onboarding and Settings pick per card. */
export function kindForTrigger(trigger: PermissionTrigger): PermissionKind | null {
  if (trigger === 'onboarding' || trigger === 'settings') return null;
  return TRIGGER_CATALOGUE[trigger].kind;
}
