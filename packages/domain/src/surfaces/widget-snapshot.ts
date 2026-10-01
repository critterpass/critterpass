/**
 * The widget snapshot (docs/api-contracts.md `GET /v1/widgets/snapshot`, docs/api-contracts-async.md
 * §6 `snapshot/widgets.json`): one compact document every home, lock-screen and StandBy widget
 * renders from, served by the api and written to the App Group by the app or the widget push
 * handler. Versioned by `schema`; readers ignore fields they do not know.
 *
 * Privacy (docs/data-model-sync-and-privacy.md §1): ids, labels, counts and the viewer's own net
 * balance only. No coordinates, no budget, nobody else's balance. A perk the viewer lacks is listed
 * in `locked` and its section is null, so a widget shows its locked state and offer, never data.
 *
 * Also here: the widget commands' payloads and the refresh queue the worker runs, so the api, the
 * worker and the app share one vocabulary.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;

export const WIDGET_KINDS = [
  'countdown',
  'vote',
  'today',
  'balances',
  'crew',
  'critterdex',
  'next_flight',
  'next_leave_by',
  'standby_clock',
] as const;
export const widgetKindSchema = z.enum(WIDGET_KINDS);
export type WidgetKind = z.infer<typeof widgetKindSchema>;

export const WIDGET_FAMILIES = [
  'system_small',
  'system_medium',
  'system_large',
  'accessory_inline',
  'accessory_circular',
  'accessory_rectangular',
  'android',
] as const;
export const widgetFamilySchema = z.enum(WIDGET_FAMILIES);

/** Widgets a perk gates, and the offer their locked state opens. */
export const LOCKABLE_WIDGETS = { crew: 'boost', next_flight: 'pass_plus' } as const;
export type LockableWidget = keyof typeof LOCKABLE_WIDGETS;

const instant = z.iso.datetime({ offset: true });
const localDate = z.iso.date();

export const widgetSnapshotSchema = z.object({
  schema: z.literal(WIDGET_SNAPSHOT_SCHEMA_VERSION),
  generated_at: instant,
  trip: z
    .object({
      id: z.uuid(),
      destination: z.string().nullable(),
      status: z.string(),
      start_date: localDate.nullable(),
      end_date: localDate.nullable(),
      tz: z.string().nullable(),
    })
    .nullable(),
  /** The viewer's own countdown target: first outbound departure, else trip start. */
  countdown: z.object({ target_at: instant }).nullable(),
  vote: z
    .object({
      poll_id: z.uuid(),
      question: z.string().nullable(),
      status: z.enum(['open', 'closed']),
      closes_at: instant.nullable(),
      options: z.array(z.object({ id: z.uuid(), label: z.string(), votes: z.number().int() })),
      voted: z.number().int(),
      eligible: z.number().int(),
      my_option_id: z.uuid().nullable(),
      winner_option_id: z.uuid().nullable(),
    })
    .nullable(),
  today: z
    .object({
      local_date: localDate,
      items: z.array(
        z.object({
          id: z.uuid(),
          icon: z.string(),
          text: z.string(),
          action: z.string(),
          status: z.string(),
          deep_link: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  /** The viewer's own net only; widgets mark it `privacySensitive`. */
  balances: z.object({ currency: z.string(), net_minor: z.number().int() }).nullable(),
  crew: z
    .object({
      meetup: z.object({ place_name: z.string(), meet_at: instant }).nullable(),
      members: z.array(
        z.object({ user_id: z.uuid(), bucket: z.enum(['here', 'close', 'on_way', 'unknown']) }),
      ),
    })
    .nullable(),
  critterdex: z.object({ found: z.number().int(), total: z.number().int() }),
  next_flight: z
    .object({
      id: z.uuid(),
      carrier: z.string(),
      flight_no: z.string(),
      dep_airport: z.string(),
      arr_airport: z.string(),
      departs_at: instant,
      boarding_at: instant.nullable(),
      gate: z.string().nullable(),
      terminal: z.string().nullable(),
      status: z.string(),
      delay_min: z.number().int().nullable(),
    })
    .nullable(),
  next_leave_by: z
    .object({
      id: z.uuid(),
      title: z.string(),
      place_name: z.string().nullable(),
      leave_at: instant,
      state: z.string(),
    })
    .nullable(),
  entitlements: z.object({ pass_plus: z.boolean(), boost_active: z.boolean() }),
  locked: z.array(z.enum(['crew', 'next_flight'])),
});
export type WidgetSnapshot = z.infer<typeof widgetSnapshotSchema>;

type Section<K extends keyof WidgetSnapshot> = NonNullable<WidgetSnapshot[K]>;

export interface WidgetSnapshotInput {
  readonly now: Date;
  readonly trip: Section<'trip'> | null;
  readonly countdownTargetAt: Date | null;
  readonly vote: Section<'vote'> | null;
  readonly today: Section<'today'> | null;
  readonly balances: Section<'balances'> | null;
  readonly crew: Section<'crew'> | null;
  readonly critterdex: WidgetSnapshot['critterdex'];
  readonly nextFlight: Section<'next_flight'> | null;
  readonly nextLeaveBy: Section<'next_leave_by'> | null;
  readonly passPlus: boolean;
  readonly boostActive: boolean;
}

/** Builds and validates the snapshot; gated sections are dropped, never sent behind a flag. */
export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const locked: LockableWidget[] = [];
  if (!input.boostActive) locked.push('crew');
  if (!input.passPlus) locked.push('next_flight');
  return widgetSnapshotSchema.parse({
    schema: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    generated_at: input.now.toISOString(),
    trip: input.trip,
    countdown:
      input.countdownTargetAt === null
        ? null
        : { target_at: input.countdownTargetAt.toISOString() },
    vote: input.vote,
    today: input.today,
    balances: input.balances,
    crew: input.boostActive ? input.crew : null,
    critterdex: input.critterdex,
    next_flight: input.passPlus ? input.nextFlight : null,
    next_leave_by: input.nextLeaveBy,
    entitlements: { pass_plus: input.passPlus, boost_active: input.boostActive },
    locked,
  });
}

/** How far a member is from the meet-up, as the crew widget draws it (no distances leave). */
export function etaBucket(
  etaMin: number | null,
  progress: number | null,
): 'here' | 'close' | 'on_way' | 'unknown' {
  if (progress !== null && progress >= 1) return 'here';
  if (etaMin === null) return 'unknown';
  if (etaMin <= 2) return 'here';
  return etaMin <= 15 ? 'close' : 'on_way';
}

/** The snapshot's content without its clock, for a stable ETag. */
export function widgetSnapshotContent(
  snapshot: WidgetSnapshot,
): Omit<WidgetSnapshot, 'generated_at'> {
  const { generated_at: _generatedAt, ...content } = snapshot;
  return content;
}

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
