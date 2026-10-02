/**
 * The widget commands' payloads (docs/api-contracts.md `register_widget_token`,
 * `sync_installed_widgets`) and the refresh queue the worker runs, so the api, the worker and the
 * app share one vocabulary with the snapshot (./widget-snapshot.ts).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';
import { widgetFamilySchema, widgetKindSchema } from './widget-snapshot';

// ---------------------------------------------------------------------------------------------
// Commands (docs/api-contracts.md `register_widget_token`, `sync_installed_widgets`).

export const registerWidgetTokenPayloadSchema = z.object({
  /** `all`: iOS hands one token to the whole widget extension. */
  widget_kind: z.union([z.literal('all'), widgetKindSchema]).default('all'),
  token: z
    .string()
    .regex(/^[0-9a-fA-F]{16,512}$/)
    .transform((token) => token.toLowerCase()),
  apns_env: z.enum(['sandbox', 'prod']).default('prod'),
});
export type RegisterWidgetTokenPayload = z.infer<typeof registerWidgetTokenPayloadSchema>;

export const installedWidgetSchema = z.object({
  kind: widgetKindSchema,
  family: widgetFamilySchema,
  trip_id: z.uuid().optional(),
  crew_id: z.uuid().optional(),
});

/** Everything the phone shows right now; the server's list for this install becomes exactly this. */
export const syncInstalledWidgetsPayloadSchema = z.object({
  widgets: z.array(installedWidgetSchema).max(64),
});
export type SyncInstalledWidgetsPayload = z.infer<typeof syncInstalledWidgetsPayloadSchema>;

// ---------------------------------------------------------------------------------------------
// Refresh pipeline (docs/api-contracts-async.md §2.2 `widgets.refresh`, §3.1 `widgets` push).

export const WIDGET_QUEUES = { refresh: 'widgets.refresh', push: 'widgets.push' } as const;

/** Routine pushes to one install are at least this far apart. */
export const WIDGET_DEBOUNCE_MS = 15 * 60_000;
/** Pushes per install per UTC day; priority pushes go out past it. */
export const WIDGET_DAILY_CAP = 40;

/** A vote closing or its tally moving is what the vote widget exists for: never held back. */
const PRIORITY_EVENTS: ReadonlySet<string> = new Set([
  'poll.closed',
  'poll.cancelled',
  'ballot.cast',
  'ballot.changed',
  'ballot.retracted',
]);

const ROUTINE_PREFIXES = [
  'poll.',
  'expense.',
  'payment.',
  'leave_by.',
  'readiness.',
  'trip.',
  'entitlement.',
  'boost.',
  'subscription.',
  'critter.',
  'flight.',
  'booking.flight_',
  'briefing.',
  'packing.',
  'meetup.',
  'rsvp.',
];

/** Whether an event moves something a widget shows, and how urgently. */
export function widgetRefreshPriority(eventType: string): 'priority' | 'routine' | null {
  if (PRIORITY_EVENTS.has(eventType)) return 'priority';
  return ROUTINE_PREFIXES.some((prefix) => eventType.startsWith(prefix)) ? 'routine' : null;
}

export const widgetsRefreshJobSchema = z.object({ event_id: z.uuid() });
export type WidgetsRefreshJob = z.infer<typeof widgetsRefreshJobSchema>;

/** One install's own push: the trailing one after a debounce window, or a retried priority one. */
export const widgetsPushJobSchema = z.object({
  device_id: z.uuid(),
  priority: z.boolean().default(false),
});
export type WidgetsPushJob = z.infer<typeof widgetsPushJobSchema>;

const WIDGET_QUEUE_SPECS = {
  'widgets.refresh': { policy: 'exclusive', retryLimit: 3, retryDelay: 5, expireInSeconds: 120 },
  'widgets.push': { policy: 'exclusive', retryLimit: 3, retryDelay: 30, expireInSeconds: 120 },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function widgetQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof WIDGET_QUEUE_SPECS, QueueSpec>> {
  return {
    'widgets.refresh': { ...defaults, ...WIDGET_QUEUE_SPECS['widgets.refresh'] },
    'widgets.push': { ...defaults, ...WIDGET_QUEUE_SPECS['widgets.push'] },
  };
}

export const WIDGET_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof WIDGET_QUEUE_SPECS, string>> =
  {
    'widgets.refresh':
      "Tells the phones showing an event's widgets to refresh, within their budget",
    'widgets.push': 'Sends one install its held widget refresh once the debounce window ends',
  };
