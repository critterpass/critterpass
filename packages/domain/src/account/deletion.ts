/**
 * Account deletion (3n-9 … 3n-11, docs/api-contracts.md §4.1 `request_account_deletion`,
 * `restore_account`). An account someone can sign back into closes at once and is purged after the
 * grace window; one with no way back in has nothing to restore and is purged on the next run.
 */
import { z } from 'zod';

export const DELETION_GRACE_DAYS = 30;

export const DELETION_REASONS = [
  'trips_over',
  'too_many_pings',
  'crew_moved_apps',
  'privacy',
  'something_else',
] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export const DELETION_SOURCES = ['app', 'web'] as const;
export type DeletionSource = (typeof DELETION_SOURCES)[number];

export const requestAccountDeletionPayloadSchema = z
  .object({
    reason: z.enum(DELETION_REASONS).optional(),
    /** The web deletion page (`GET /account/delete`) sends `web`; the app omits it. */
    source: z.enum(DELETION_SOURCES).default('app'),
  })
  .strict();
export type RequestAccountDeletionPayload = z.infer<typeof requestAccountDeletionPayloadSchema>;

export const restoreAccountPayloadSchema = z.object({}).strict();

export const CONTACT_KINDS = ['email', 'phone', 'none'] as const;

export const accountDeletionResultSchema = z.object({
  deletion_id: z.uuid(),
  requested_at: z.iso.datetime({ offset: true }),
  purge_at: z.iso.datetime({ offset: true }),
  /** Nothing to restore into: purged on the next run (no 3n-11 undo). */
  instant: z.boolean(),
  /** Where the confirmation went, masked (`w•••@gmail.com`, `+84 ••• ••• 12`). */
  contact: z.object({ kind: z.enum(CONTACT_KINDS), masked: z.string().nullable() }),
});
export type AccountDeletionResult = z.infer<typeof accountDeletionResultSchema>;

/** `w•••@gmail.com`: first character of the local part, the domain in full. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

/** `+84 ••• 12`: country prefix as typed up to the first 3 digits, the last two digits. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 5) return '•••';
  return `+${digits.slice(0, 2)} ••• ${digits.slice(-2)}`;
}

/** `GET /v1/me/account`: what the restore interstitial needs, answered even while closed. */
export const accountStateSchema = z.object({
  status: z.enum(['anonymous', 'registered', 'closed', 'purged']),
  deletion: z
    .object({
      requested_at: z.iso.datetime({ offset: true }),
      purge_at: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export type AccountState = z.infer<typeof accountStateSchema>;

/** `POST /v1/me/deletion/purge-now`: the caller's account, erased at once (never in production). */
export const purgeNowResultSchema = z.object({
  purged: z.literal(true),
  user_id: z.uuid(),
  deletion_id: z.uuid(),
  purged_at: z.iso.datetime({ offset: true }),
});
export type PurgeNowResult = z.infer<typeof purgeNowResultSchema>;

/** The store that bills a live subscription: deleting the account never cancels it there. */
export const SUBSCRIPTION_SOURCES = ['app_store', 'play', 'promo', 'gift'] as const;

/**
 * `GET /v1/me/deletion/preflight` (3n-9): what goes and what the crew keeps, with real numbers.
 * `balances.net_minor` is positive when the crew owes the caller, negative when the caller owes.
 */
export const deletionPreflightSchema = z.object({
  /** No way back in (anonymous): the account is erased on the next run, with no undo page. */
  instant: z.boolean(),
  critters: z.number().int().nonnegative(),
  stamps: z.number().int().nonnegative(),
  balances: z.array(
    z.object({
      crew_id: z.uuid(),
      crew_name: z.string(),
      currency: z.string().length(3),
      net_minor: z.number().int(),
    }),
  ),
  /** Open trips the caller organises: who takes over at close, or nobody when alone on it. */
  organised_trips: z.array(
    z.object({
      trip_id: z.uuid(),
      trip_name: z.string().nullable(),
      transfer_to_name: z.string().nullable(),
      sole_member: z.boolean(),
    }),
  ),
  /** A trip the caller is on right now, if any. */
  active_trip: z.object({ trip_id: z.uuid(), trip_name: z.string().nullable() }).nullable(),
  subscription: z.object({ source: z.enum(SUBSCRIPTION_SOURCES) }).nullable(),
});
export type DeletionPreflight = z.infer<typeof deletionPreflightSchema>;
