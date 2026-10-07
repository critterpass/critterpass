/**
 * Monetization command payloads and results (docs/api-contracts.md §4.15). The app calls these
 * through `/v1/cmd/{name}`; `record_paywall_event` is offline-capable, the rest are online only.
 */
import { z } from 'zod';

import { paywallChannelSchema, paywallEntryPointSchema } from '../paywall/entries';
import { boostSplitModeSchema, revocationReasonSchema, storePlatformSchema } from './states';

/**
 * The app reports a purchase the store just confirmed, so entitlements do not wait on the webhook.
 * The server verifies it with RevenueCat before granting anything (idempotent on the store
 * transaction id); `intent_id` binds a boost purchase to the trip lock it was bought under.
 */
export const fulfilPurchasePayloadSchema = z.strictObject({
  source: z.literal('client_sync'),
  platform: storePlatformSchema,
  transaction_id: z.string().min(1).max(200),
  store_product_id: z.string().min(1).max(200),
  intent_id: z.uuid().optional(),
});
export type FulfilPurchasePayload = z.infer<typeof fulfilPurchasePayloadSchema>;

export const fulfilPurchaseResultSchema = z.object({
  status: z.enum(['fulfilled', 'pending']),
  product_key: z.string(),
  pass_plus: z.boolean(),
  boost_id: z.uuid().nullable(),
});
export type FulfilPurchaseResult = z.infer<typeof fulfilPurchaseResultSchema>;

/** System only (refund or store revocation), also reachable through the console. */
export const revokePurchasePayloadSchema = z.strictObject({
  platform: storePlatformSchema,
  transaction_id: z.string().min(1).max(200),
  reason: revocationReasonSchema,
});
export type RevokePurchasePayload = z.infer<typeof revokePurchasePayloadSchema>;

/**
 * Take a trip's boost lock before paying (15 minutes). `member_uids` are the seated members the
 * cost splits over, the buyer included; covering it names nobody.
 */
export const createBoostIntentPayloadSchema = z.strictObject({
  intent_id: z.uuid(),
  trip_id: z.uuid(),
  product_key: z.enum(['boost_trip', 'boost_crew_year']),
  split_mode: boostSplitModeSchema,
  member_uids: z.array(z.uuid()).max(16).default([]),
});
export type CreateBoostIntentPayload = z.infer<typeof createBoostIntentPayloadSchema>;

export const createBoostIntentResultSchema = z.object({
  intent_id: z.uuid(),
  /** Set as the RevenueCat subscriber attribute `boost_intent_id` before purchasing. */
  subscriber_attribute: z.object({ key: z.literal('boost_intent_id'), value: z.uuid() }),
  /** iOS `appAccountToken` / Play `obfuscatedAccountId`: the buyer's uid. */
  app_account_token: z.uuid(),
  expires_at: z.iso.datetime({ offset: true }),
});
export type CreateBoostIntentResult = z.infer<typeof createBoostIntentResultSchema>;

export const releaseBoostIntentPayloadSchema = z.strictObject({ intent_id: z.uuid() });
export const thankBoostPayloadSchema = z.strictObject({ boost_id: z.uuid() });
/** The buyer posts the boost's card to the crew chat (once per boost). */
export const tellCrewBoostPayloadSchema = z.strictObject({ boost_id: z.uuid() });
export const moveBoostPayloadSchema = z.strictObject({ boost_id: z.uuid(), to_trip_id: z.uuid() });
export const applyBoostCreditPayloadSchema = z.strictObject({
  credit_id: z.uuid(),
  trip_id: z.uuid(),
});
export const rebindCrewYearPayloadSchema = z.strictObject({
  grant_id: z.uuid(),
  crew_id: z.uuid(),
});

/** One paywall moment, recorded (offline too) for the governor. `id` is the client's UUIDv7. */
export const recordPaywallEventPayloadSchema = z.strictObject({
  id: z.uuid(),
  entry_point: paywallEntryPointSchema,
  trip_id: z.uuid().nullable().default(null),
  kind: z.enum(['shown', 'dismissed', 'quiet_no']),
  channel: paywallChannelSchema.default('app'),
  /** The device's calendar date when it happened (its own time zone). */
  local_date: z.iso.date(),
});
export type RecordPaywallEventPayload = z.infer<typeof recordPaywallEventPayloadSchema>;

/** How long before the resume date the reminder to turn Pass+ back on goes out. */
export const PAUSE_REMIND_LEAD_DAYS = 7;
/** The furthest ahead a pause can be planned. */
export const PAUSE_MAX_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the reminder for a pause ending at `resumeAt` is due. */
export function pauseRemindAt(resumeAt: Date): Date {
  return new Date(resumeAt.getTime() - PAUSE_REMIND_LEAD_DAYS * DAY_MS);
}

/** A resume date is one in the future, no further out than a pause can be planned. */
export function pauseResumeAllowed(resumeAt: Date, now: Date): boolean {
  const ahead = resumeAt.getTime() - now.getTime();
  return ahead > 0 && ahead <= PAUSE_MAX_DAYS * DAY_MS;
}

/**
 * Whether the reminder still has something to say when its timer fires: the pause is still
 * planned for a date a week or less away, and renewal is still off. Someone who turned renewal
 * back on, or moved the date later, is not reminded.
 */
export function pauseReminderDue(
  subscription: {
    readonly status: string;
    readonly autoRenew: boolean;
    readonly resumeAt: Date | null;
  },
  now: Date,
): boolean {
  const { resumeAt } = subscription;
  if (resumeAt === null || resumeAt.getTime() <= now.getTime()) return false;
  if (pauseRemindAt(resumeAt).getTime() > now.getTime()) return false;
  if (subscription.autoRenew) return false;
  return ['active', 'cancelled_active', 'expired'].includes(subscription.status);
}

/**
 * The App Store has no pause, so the person turns renewal off in the store and the app records
 * when they mean to come back. The server keeps the date on their monthly Pass+ row and reminds
 * them a week before it; nothing is granted or taken away by this command.
 */
export const setPauseIntentPayloadSchema = z.strictObject({
  resume_at: z.iso.datetime({ offset: true }),
});
export type SetPauseIntentPayload = z.infer<typeof setPauseIntentPayloadSchema>;

export const setPauseIntentResultSchema = z.object({
  subscription_id: z.uuid(),
  resume_at: z.iso.datetime({ offset: true }),
  /** Null when the resume date is less than the reminder's lead away: no reminder is sent. */
  remind_at: z.iso.datetime({ offset: true }).nullable(),
});
export type SetPauseIntentResult = z.infer<typeof setPauseIntentResultSchema>;
