/**
 * Realtime namespace catalogue (docs/api-contracts-async.md §1.2): ACL rule, history, presence and
 * client-publish rules for the core namespaces. The api's subscribe/publish proxies, the Centrifugo
 * config (infra/centrifugo/config.json, drift-checked by a test) and the worker relay all read this
 * one list. Object namespaces (`poll`, `swipe`, `proposal`, ...) are added by the phases that own
 * their tables, through the api's `registerNamespace()`.
 */
import { z } from 'zod';

import type { ChannelNamespace } from '../channel-names';

/**
 * Who may subscribe. Each rule is one SQL predicate over the RLS helper functions (docs/data-
 * model.md §2), run as `app_user` with `app.uid` set, so the subscribe proxy and RLS can never
 * disagree about membership.
 */
export type RtAclRule =
  'self' | 'crew_member' | 'trip_member' | 'trip_participant' | 'trip_organiser';

/**
 * The predicate each rule evaluates, with the channel id as `$1`. Shared as text so the permission
 * suite in packages/db runs exactly what the subscribe proxy runs. A trip participant must still be
 * an active crew member (a removed member keeps their `trip_participants` row) and must not have
 * answered `out`, unless they organise the trip.
 */
export const RT_ACL_RULE_SQL: Readonly<Record<RtAclRule, string>> = {
  self: 'SELECT $1::uuid = app.uid() AS allowed',
  crew_member: 'SELECT app.is_crew_member($1::uuid) AS allowed',
  // Any active member of the trip's crew, RSVP or not: what the trip stream and the setup tables'
  // RLS already show them (trip setup happens before anyone has answered).
  trip_member: 'SELECT app.is_trip_member($1::uuid) AS allowed',
  trip_participant: `SELECT app.is_trip_member($1::uuid) AND (
      app.is_trip_organiser($1::uuid)
      OR EXISTS (
        SELECT 1 FROM trip_participants
        WHERE trip_id = $1::uuid AND user_id = app.uid() AND rsvp <> 'out'
      )
    ) AS allowed`,
  trip_organiser:
    'SELECT app.is_trip_member($1::uuid) AND app.is_trip_organiser($1::uuid) AS allowed',
};

export interface RtHistory {
  readonly size: number;
  readonly ttlSeconds: number;
}

export interface RtClientPublishType {
  /** The exact object a client publishes, e.g. `{type: 'typing'}`; anything else is dropped. */
  readonly schema: z.ZodType<{ readonly type: string; readonly data?: unknown }>;
  /** At most one publication of this type per user per channel within this window. */
  readonly minIntervalMs: number;
}

export interface RtClientPublish {
  readonly maxBytes: number;
  readonly types: Readonly<Record<string, RtClientPublishType>>;
}

export interface RtNamespaceSpec {
  readonly name: ChannelNamespace;
  readonly acl: RtAclRule;
  /** `null` = no history (ephemeral traffic only, never recoverable). */
  readonly history: RtHistory | null;
  /** Centrifugo presence + join/leave, with `info` (display name, avatar) from the subscribe proxy. */
  readonly presence: boolean;
  readonly clientPublish?: RtClientPublish;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Typing indicators: at most one per 3 s (docs/api-contracts-async.md §1.1 "Throttle"). */
const TYPING_INTERVAL_MS = 3000;
/** Element-anchored presence: at most 5 Hz per type. */
const PRESENCE_INTERVAL_MS = 200;

export const rtTypingPublishSchema = z.strictObject({ type: z.literal('typing') });

export const rtHerePublishSchema = z.strictObject({
  type: z.literal('here'),
  data: z.strictObject({
    screen: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/),
    day: z.number().int().min(1).max(366).nullable(),
  }),
});

/** `anchor` is a stable element id such as `plan_item:<id>`; `null` clears the cursor on blur. */
export const rtCursorPublishSchema = z.strictObject({
  type: z.literal('cursor'),
  data: z.strictObject({
    anchor: z
      .string()
      .regex(/^[a-z][a-z_]{0,31}:[A-Za-z0-9_-]{1,64}$/)
      .nullable(),
    offset: z.number().int().min(-1440).max(1440).optional(),
  }),
});

export const RT_CORE_NAMESPACES: readonly RtNamespaceSpec[] = [
  { name: 'user', acl: 'self', history: { size: 100, ttlSeconds: DAY }, presence: false },
  { name: 'crew', acl: 'crew_member', history: { size: 50, ttlSeconds: DAY }, presence: true },
  {
    name: 'crew_chat',
    acl: 'crew_member',
    history: { size: 200, ttlSeconds: 3 * DAY },
    presence: true,
    clientPublish: {
      maxBytes: 256,
      types: { typing: { schema: rtTypingPublishSchema, minIntervalMs: TYPING_INTERVAL_MS } },
    },
  },
  {
    name: 'crew_money',
    acl: 'crew_member',
    history: { size: 100, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'crew_bookings',
    acl: 'crew_member',
    history: { size: 50, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'crew_collection',
    acl: 'crew_member',
    history: { size: 50, ttlSeconds: 7 * DAY },
    presence: false,
  },
  {
    name: 'trip',
    acl: 'trip_participant',
    history: { size: 100, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'trip_setup',
    acl: 'trip_member',
    history: { size: 50, ttlSeconds: 3 * DAY },
    presence: true,
  },
  {
    name: 'trip_draft',
    acl: 'trip_organiser',
    history: { size: 100, ttlSeconds: DAY },
    presence: false,
  },
  {
    name: 'trip_plan',
    acl: 'trip_participant',
    history: { size: 200, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'trip_dayof',
    acl: 'trip_participant',
    history: { size: 50, ttlSeconds: DAY },
    presence: false,
  },
  {
    name: 'trip_watch',
    acl: 'trip_participant',
    history: { size: 50, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'trip_quests',
    acl: 'trip_participant',
    history: { size: 50, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'trip_album',
    acl: 'trip_participant',
    history: { size: 100, ttlSeconds: 3 * DAY },
    presence: false,
  },
  {
    name: 'trip_presence',
    acl: 'trip_member',
    history: null,
    presence: true,
    clientPublish: {
      maxBytes: 512,
      types: {
        here: { schema: rtHerePublishSchema, minIntervalMs: PRESENCE_INTERVAL_MS },
        cursor: { schema: rtCursorPublishSchema, minIntervalMs: PRESENCE_INTERVAL_MS },
        typing: { schema: rtTypingPublishSchema, minIntervalMs: TYPING_INTERVAL_MS },
      },
    },
  },
];

/** Crew-id-keyed core namespaces: a crew removal unsubscribes the ex-member from every one. */
export const RT_CREW_SCOPED_NAMESPACES: readonly ChannelNamespace[] = RT_CORE_NAMESPACES.filter(
  (spec) => spec.acl === 'crew_member',
).map((spec) => spec.name);

/** Trip-id-keyed core namespaces: leaving a crew or declining a trip unsubscribes from every one. */
export const RT_TRIP_SCOPED_NAMESPACES: readonly ChannelNamespace[] = RT_CORE_NAMESPACES.filter(
  (spec) =>
    spec.acl === 'trip_member' || spec.acl === 'trip_participant' || spec.acl === 'trip_organiser',
).map((spec) => spec.name);

export interface RtChannel {
  readonly namespace: string;
  readonly id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Splits `<namespace>:<id>` (and the user-limited `user:#<uid>`) into its parts; `null` for any
 * malformed name, a `user` channel without the `#` boundary, or a non-UUID id. Whether the
 * namespace is registered is the caller's question.
 */
export function parseRtChannel(channel: string): RtChannel | null {
  const boundary = channel.indexOf(':');
  if (boundary <= 0) return null;
  const namespace = channel.slice(0, boundary);
  let id = channel.slice(boundary + 1);
  if (namespace === 'user') {
    if (!id.startsWith('#')) return null;
    id = id.slice(1);
  }
  if (!UUID.test(id)) return null;
  return { namespace, id: id.toLowerCase() };
}
