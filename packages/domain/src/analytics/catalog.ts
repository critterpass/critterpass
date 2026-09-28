/**
 * The product analytics event catalog: one strict zod schema per event, named `object_action`.
 * Nothing outside this catalog is sent to PostHog (docs/code-standards.md §11). Event-specific
 * props are ids, enums, buckets, counts and durations; the common props (./common.ts) are merged
 * into every schema. Events are appended, never renamed: funnels and dashboards key on the name.
 */
import { z } from 'zod';

import { aiRouteSchema, aiTierSchema } from '../ai/routes';
import { productKeySchema } from '../entitlements/product-keys';
import { tripParticipantRsvpSchema } from '../enums/trip';
import { LINK_CHANNELS, LINK_KINDS } from '../links/grammar';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CLASSES } from '../notifications';

import {
  bandBucketSchema,
  commonPropsSchema,
  countBucketSchema,
  countSchema,
  durationMsSchema,
  tokenBucketSchema,
} from './common';

const count = countSchema;
const ms = durationMsSchema;
const flag = z.boolean();
const oneOf = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

const via = oneOf(['referrer', 'paste', 'code', 'phone', 'clip', 'link']);
const channel = z.enum(LINK_CHANNELS);
const modelTag = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);

/** Event-specific props; every one is optional unless the funnel needs it to be meaningful. */
const EVENT_PROPS = {
  // Acquisition
  link_clicked: {
    type: z.enum(LINK_KINDS),
    channel: channel.optional(),
    is_bot: flag,
  },
  install_attributed: { via },
  invite_prefill_viewed: {},
  // Invited fast path: link open to the crew manifest (target p50 ≤ 15 s).
  invite_manifest_reached: { duration_ms: ms, waitlisted: flag },
  pass_issued: { path: oneOf(['new', 'invited']), duration_ms: ms },
  // The onboarding funnel: one event per step reached (resumed steps included).
  onboarding_step: {
    step: oneOf([
      'splash',
      'name',
      'photo',
      'taste',
      'home',
      'issued',
      'save',
      'phone',
      'permissions',
      'done',
    ]),
    path: oneOf(['new', 'invited', 'returning']).optional(),
  },
  account_saved: { provider: oneOf(['apple', 'google', 'phone']) },
  permission_result: {
    perm: oneOf([
      'notifications',
      'location',
      'location_always',
      'camera',
      'photos',
      'contacts',
      'alarms',
      'calendar',
      'microphone',
      'speech',
      'photos_read',
      'live_activities',
    ]),
    context: z.string().regex(/^[a-z0-9_]{1,40}$/u),
    result: oneOf(['granted', 'denied', 'limited', 'blocked']),
  },
  // A primer card or just-in-time sheet shown before any OS prompt.
  permission_primer_shown: {
    kind: z.string().regex(/^[a-z_]{1,24}$/u),
    trigger: z.string().regex(/^[a-z0-9_]{1,40}$/u),
    settings_only: flag.optional(),
  },
  // Web: the only event critterpass.app sends besides page views (cookieless, anonymous).
  cta_clicked: { cta: z.string().regex(/^[a-z0-9_]{1,40}$/u) },
  // Crew / vote
  crew_created: {},
  crew_joined: { via: oneOf(['link', 'code', 'qr', 'invite', 'merge']).optional() },
  invite_sent: { channel },
  place_pitched: { by: oneOf(['member', 'guide']), stream_ms: ms.optional() },
  ballot_cast: { poll_kind: oneOf(['place', 'dates', 'budget', 'activity', 'other']) },
  poll_closed: { reason: oneOf(['all_voted', 'deadline', 'manual']) },
  reveal_seen: {},
  // Setup / plan
  dates_locked: { all_free: flag, method: oneOf(['vote', 'organiser', 'suggested']) },
  budget_max_set: {},
  budget_locked: { band_bucket: bandBucketSchema },
  mustdo_added: { fit: oneOf(['fits', 'tight', 'no_fit']) },
  draft_completed: { duration_ms: ms, failed_steps: count },
  redraft_decided: { kept: flag, quota_left: count },
  plan_edited: { op: oneOf(['add', 'remove', 'move', 'swap', 'retime']) },
  changeset_applied: { scope: oneOf(['item', 'day', 'trip']).optional(), n: count.optional() },
  // Proposal
  proposal_sent: { format: oneOf(['link', 'poster', 'trailer']), n: count },
  proposal_opened: { dedup: flag },
  trailer_completed: {},
  rsvp_changed: { status: tripParticipantRsvpSchema },
  boarded: { time_to_board: ms },
  // Guide
  guide_question: { modality: oneOf(['text', 'voice', 'photo']), metered: flag },
  guide_answer: {
    latency_ms: ms,
    tools: count,
    token_bucket: tokenBucketSchema,
    fallback: flag,
  },
  guide_limit_hit: {},
  changeset_from_chat: {},
  // Trip
  booking_added: { source: oneOf(['manual', 'email', 'supplier', 'guide', 'import']) },
  expense_added: {
    source: oneOf(['manual', 'receipt', 'guide', 'booking']),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  },
  receipt_scanned: { quality: oneOf(['good', 'partial', 'failed']) },
  settled_all: {},
  im_up: { source: oneOf(['app', 'la', 'notification', 'widget', 'alarm']), min_before: count },
  alarm_snoozed: {},
  offline_session: { duration: ms, queued_ops: count },
  disruption_resolved: { auto_actions: count, approvals: count },
  help_opened: { entry: z.string().regex(/^[a-z0-9_]{1,40}$/u) },
  sos_triggered: {},
  sos_resolved: { time_to_responder: ms },
  // Critters / after
  // Location engine sessions and POI visits (never a POI id or a coordinate).
  location_session: {
    mode: oneOf(['trip_day', 'travel_day', 'explore_at_home']),
    minutes: count,
    high_accuracy_minutes: count.optional(),
    updates: count.optional(),
  },
  visit_recorded: { source: oneOf(['geofence', 'expense', 'manual']) },
  egg_hatched: { trigger: oneOf(['visit', 'quest', 'trip_end', 'gift']) },
  encounter_ended: {
    outcome: oneOf(['caught', 'fled', 'dismissed']),
    dwell_s: count,
    rarity: oneOf(['common', 'uncommon', 'rare', 'legendary']),
    offline: flag,
  },
  quest_completed: {},
  recap_story_completed: {},
  photos_uploaded: { n: countBucketSchema },
  plan_published: { toggles: count },
  // Monetise / off-app
  paywall_shown: {
    entry_point: z.string().regex(/^[a-z0-9_]{1,40}$/u),
    suppressed_reason: oneOf(['governor', 'entitled', 'quiet']).optional(),
  },
  purchase_completed: { product: productKeySchema, split_mode: oneOf(['solo', 'split', 'gift']) },
  purchase_refunded: { product: productKeySchema },
  trial_converted: { product: productKeySchema },
  referral_qualified: {},
  quiet_no: {},
  subscription_state_changed: {
    state: oneOf(['active', 'grace', 'billing_retry', 'expired', 'cancelled', 'paused']),
  },
  notification_delivered: {
    category: z.enum(NOTIFICATION_CATEGORIES),
    class: z.enum(NOTIFICATION_CLASSES),
    overflowed: flag,
  },
  roundup_sent: { n: count },
  la_started: { kind: oneOf(['im_up', 'travel_day', 'vote']), started_via: oneOf(['app', 'push']) },
  widget_action: { kind: z.string().regex(/^[a-z0-9_]{1,40}$/u) },
  // Ops (internal)
  llm_call: {
    feature: aiRouteSchema,
    model: modelTag,
    tier: aiTierSchema,
    latency: ms,
    cost_est: count,
  },
  job_failed: { kind: z.string().regex(/^[a-z0-9_.]{1,64}$/u) },
  outbox_conflict: { op: z.string().regex(/^[a-z0-9_]{1,64}$/u) },
} as const satisfies Record<string, z.ZodRawShape>;

export type AnalyticsEventName = keyof typeof EVENT_PROPS;
export const ANALYTICS_EVENT_NAMES = Object.keys(EVENT_PROPS) as AnalyticsEventName[];
export const analyticsEventNameSchema = z.enum(
  ANALYTICS_EVENT_NAMES as [AnalyticsEventName, ...AnalyticsEventName[]],
);

const buildSchema = <S extends z.ZodRawShape>(shape: S) => commonPropsSchema.extend(shape).strict();
type PropsSchemaOf<N extends AnalyticsEventName> = ReturnType<
  typeof buildSchema<(typeof EVENT_PROPS)[N]>
>;

const EVENT_SCHEMAS = Object.fromEntries(
  ANALYTICS_EVENT_NAMES.map((name) => [name, buildSchema(EVENT_PROPS[name] as z.ZodRawShape)]),
) as { readonly [N in AnalyticsEventName]: PropsSchemaOf<N> };

export type AnalyticsEventProps<N extends AnalyticsEventName> = z.input<PropsSchemaOf<N>>;

/** One catalog event: `{event, properties}` narrowed by name. */
export type AnalyticsEvent = {
  [N in AnalyticsEventName]: { readonly event: N; readonly properties: AnalyticsEventProps<N> };
}[AnalyticsEventName];

export function getAnalyticsEventSchema<N extends AnalyticsEventName>(name: N): PropsSchemaOf<N> {
  return EVENT_SCHEMAS[name];
}

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.hasOwn(EVENT_PROPS, name);
}

/** Typed constructor: `track('ballot_cast', {poll_kind: 'place'})` checks props at compile time. */
export function track<N extends AnalyticsEventName>(
  event: N,
  properties: AnalyticsEventProps<N>,
): { readonly event: N; readonly properties: AnalyticsEventProps<N> } {
  return { event, properties };
}
