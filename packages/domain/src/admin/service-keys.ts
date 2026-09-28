/**
 * The `services` config keys (docs/api-contracts.md §4.17): kill switches (missing = on), AI spend
 * caps and ops timings. They are edited on the console's services screen, never the flags list;
 * tier switches, billing and every cap are owner only.
 */
import { z } from 'zod';

import { AI_ROUTES, GENERATION_TIERS } from '../ai/routes';
import { DomainError } from '../errors';
import type { ConfigKeyDefinition } from './config-keys';
import type { AdminRole } from './roles';

const usd = z.number().min(0).max(1_000_000);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** OTP sender channels a switch can turn off (`otp.<channel>.enabled`). */
export const OTP_SWITCH_CHANNELS = ['whatsapp', 'twilio_verify', 'prelude'] as const;
/** Live Activity / Live Update kinds a switch can turn off (`la.<kind>.enabled`). */
export const LIVE_ACTIVITY_SWITCH_KINDS = [
  'leave_by',
  'meet_up',
  'flight',
  'vote',
  'critter_nearby',
  'storm',
  'sos',
  'alarm',
] as const;

const OWNER_ONLY: readonly AdminRole[] = ['owner'];

function killSwitch(description: string, roles?: readonly AdminRole[]): ConfigKeyDefinition {
  return {
    schema: z.boolean(),
    isPublic: false,
    critical: true,
    description,
    group: 'services',
    note: 'Off returns STATE_INVALID switched_off; the app shows its fallback',
    ...(roles !== undefined ? { roles } : {}),
  };
}

function spendCap(description: string): ConfigKeyDefinition {
  return {
    schema: usd,
    isPublic: false,
    critical: true,
    description,
    group: 'services',
    roles: OWNER_ONLY,
    note: 'Alert at 80 %, pause at 100 %; never re-routes to another model',
  };
}

const hours = z.number().int().min(1).max(720);

function opsSetting(schema: z.ZodType, description: string, note?: string): ConfigKeyDefinition {
  return {
    schema,
    isPublic: false,
    critical: false,
    description,
    group: 'services',
    ...(note !== undefined ? { note } : {}),
  };
}

/** Kill switches, spend caps and ops timings: the services group. */
export function serviceKeys(): Record<string, ConfigKeyDefinition> {
  return {
    ...Object.fromEntries(
      AI_ROUTES.map((route) => [`ai.${route}.enabled`, killSwitch(`AI route ${route}`)]),
    ),
    ...Object.fromEntries(
      GENERATION_TIERS.map((tier) => [
        `ai.tier.${tier}.enabled`,
        killSwitch(`Every AI route on the ${tier} tier`, OWNER_ONLY),
      ]),
    ),
    ...Object.fromEntries(
      OTP_SWITCH_CHANNELS.map((channel) => [
        `otp.${channel}.enabled`,
        killSwitch(`Sign-in codes over ${channel}`),
      ]),
    ),
    ...Object.fromEntries(
      LIVE_ACTIVITY_SWITCH_KINDS.map((kind) => [
        `la.${kind}.enabled`,
        killSwitch(`Live Activity pushes for ${kind}`),
      ]),
    ),
    'signup.enabled': killSwitch('New account sign-ups'),
    'billing.enabled': killSwitch('Purchases and plan changes', OWNER_ONLY),
    'postcards.enabled': killSwitch('Printed postcard orders'),
    'widgets.push.enabled': killSwitch('Widget refresh pushes'),
    'android.fsi.enabled': killSwitch('Android full-screen intent alerts'),
    'ai.cap.daily_usd': spendCap('AI spend cap per day, every tier (USD)'),
    ...Object.fromEntries(
      GENERATION_TIERS.map((tier) => [
        `ai.cap.${tier}.daily_usd`,
        spendCap(`AI spend cap per day on the ${tier} tier (USD)`),
      ]),
    ),
    'spend.month_budget_usd': spendCap('Monthly AI spend budget (USD)'),
    'moderation.sla_hours': opsSetting(
      hours,
      'Hours from the first filing until a report is due',
      'Default 24',
    ),
    'feedback.reply_hours': opsSetting(
      hours,
      'Hours until a feedback ticket is due a reply',
      'Default 48',
    ),
    'desk.hours': opsSetting(
      z.object({ open: clock, close: clock }).strict(),
      'Concierge desk staffed hours (Asia/Singapore)',
    ),
    'ops.on_call': opsSetting(z.string().trim().min(1).max(200), 'Who is on call for ops alerts'),
  };
}

/** The refusal of a switched-off feature: `STATE_INVALID {reason: 'switched_off', key}`, never retried. */
export function switchedOffError(
  key: string,
  extra: Readonly<Record<string, unknown>> = {},
): DomainError {
  return new DomainError('STATE_INVALID', { reason: 'switched_off', key, ...extra });
}

/** The switch key when `error` is a switched-off refusal, otherwise `undefined`. */
export function switchedOffKey(error: unknown): string | undefined {
  if (!(error instanceof DomainError) || error.code !== 'STATE_INVALID') return undefined;
  const detail = error.detail as { reason?: unknown; key?: unknown } | undefined;
  return detail?.reason === 'switched_off' && typeof detail.key === 'string'
    ? detail.key
    : undefined;
}
