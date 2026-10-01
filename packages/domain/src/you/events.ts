/**
 * Profile, settings, icon and travel-history events (docs/api-contracts.md §4.1). Payloads name
 * what changed, never the values: settings keys, an icon id, a past trip id.
 */
import { z } from 'zod';

import { APP_ICON_BASE_IDS, APP_ICON_UNLOCK_SOURCES } from './app-icons';
import { SETTINGS_COLUMNS } from './settings-schema';

export const YOU_EVENT_TYPES = [
  'settings.changed',
  'profile.icon_changed',
  'profile.icon_unlocked',
  'past_trip.added',
  'past_trip.removed',
] as const;
export type YouEventType = (typeof YOU_EVENT_TYPES)[number];

export const YOU_EVENT_PAYLOADS = {
  'settings.changed': z.object({
    user_id: z.uuid(),
    keys: z.array(z.enum(SETTINGS_COLUMNS)).min(1),
  }),
  'profile.icon_changed': z.object({ user_id: z.uuid(), icon_id: z.enum(APP_ICON_BASE_IDS) }),
  'profile.icon_unlocked': z.object({
    user_id: z.uuid(),
    icon_id: z.enum(APP_ICON_BASE_IDS),
    source: z.enum(APP_ICON_UNLOCK_SOURCES),
  }),
  'past_trip.added': z.object({ user_id: z.uuid(), past_trip_id: z.uuid() }),
  'past_trip.removed': z.object({ user_id: z.uuid(), past_trip_id: z.uuid() }),
} as const satisfies Record<YouEventType, z.ZodType>;
