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
 * The widget commands and the refresh queue are in ./widget-refresh.ts.
 */
import { z } from 'zod';

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

/** Plan rows and packing items the Today widget draws, at most. */
export const WIDGET_TODAY_PLAN_MAX = 8;
export const WIDGET_TODAY_PACKING_MAX = 4;
export const WIDGET_FORECAST_CONDITIONS = ['clear', 'cloudy', 'rain', 'storm'] as const;

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
      /** The viewer's briefing for the day (actions the Today widget can take). */
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
      /** The day's plan as the Today widget lists it: start time and a short title. */
      plan: z
        .array(z.object({ id: z.uuid(), starts_at: instant, title: z.string().max(60) }))
        .max(WIDGET_TODAY_PLAN_MAX)
        .default([]),
      /** The viewer's own and the crew's shared packing for the day, unchecked first. */
      packing: z
        .array(z.object({ id: z.uuid(), label: z.string().max(60), checked: z.boolean() }))
        .max(WIDGET_TODAY_PACKING_MAX)
        .default([]),
      /** The rest of the day's weather at the destination, for the widget's forecast line. */
      forecast: z
        .object({
          temp_max_c: z.number().int(),
          condition: z.enum(WIDGET_FORECAST_CONDITIONS),
          /** The first hour rain is likely, when it is still ahead. */
          rain_from: instant.nullable(),
        })
        .nullable()
        .default(null),
    })
    .nullable(),
  /** The viewer's own net only; widgets mark it `privacySensitive`. */
  balances: z
    .object({
      currency: z.string(),
      net_minor: z.number().int(),
      /**
       * Who the viewer may nudge about it: the crewmate who owes them most, by first name only
       * (a lock screen never shows a full name), and when a nudge may next go (null: now).
       */
      nudge: z
        .object({
          user_id: z.uuid(),
          first_name: z.string().max(24),
          available_at: instant.nullable(),
        })
        .nullable()
        .default(null),
    })
    .nullable(),
  crew: z
    .object({
      meetup: z.object({ place_name: z.string(), meet_at: instant }).nullable(),
      members: z.array(
        z.object({
          user_id: z.uuid(),
          bucket: z.enum(['here', 'close', 'on_way', 'unknown']),
          /** The member's initial, for their dot; never a name. */
          initial: z.string().max(2).default('?'),
        }),
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

// The pure helpers the server fills the smaller fields with (forecast, first names, initials).
export * from './widget-snapshot-fields';
