/**
 * Account deletion (3n-9 … 3n-11, docs/api-contracts.md §4.1 `request_account_deletion`,
 * `restore_account`, §5.5 `GET /v1/me/deletion/preflight`). A registered account closes at once and
 * is purged after the grace window; an anonymous one has nothing to restore into and is purged on
 * the next purge run.
 */
import { z } from 'zod';

export const DELETION_GRACE_DAYS = 30;
/** N-52 goes out this long before the purge. */
export const PURGE_REMINDER_DAYS = 3;
/** Off-provider dumps roll off this long after the purge (3n-11 retention line). */
export const BACKUP_ROLL_OFF_DAYS = 35;

export const DELETION_REASONS = [
  'trips_over',
  'too_many_pings',
  'crew_moved_apps',
  'privacy',
  'something_else',
] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export const DELETION_NOTE_MAX = 500;

export const DELETION_SOURCES = ['app', 'web'] as const;
export type DeletionSource = (typeof DELETION_SOURCES)[number];

export const requestAccountDeletionPayloadSchema = z
  .object({
    reason: z.enum(DELETION_REASONS).optional(),
    /** Free text behind SOMETHING ELSE; kept only until the purge. */
    note: z.string().trim().min(1).max(DELETION_NOTE_MAX).optional(),
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
  /** Anonymous accounts: nothing to restore, purged on the next run (no 3n-11 undo). */
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

// ---------------------------------------------------------------------------------------------
// Preflight (3n-9).

export const SUBSCRIPTION_SOURCES = ['app_store', 'play', 'gift', 'none'] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];

const money = z.object({ amount_minor: z.number().int(), currency: z.string().length(3) });

export const deletionPreflightSchema = z.object({
  anonymous: z.boolean(),
  goes: z.object({
    critters: z.number().int().nonnegative(),
    stamps: z.number().int().nonnegative(),
    uploads: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
  }),
  crew_keeps: z.object({
    plans: z.number().int().nonnegative(),
    expenses: z.number().int().nonnegative(),
  }),
  /** One row per crew and currency where the user's net is not zero. */
  balances: z.array(
    z.object({
      crew_id: z.uuid(),
      crew_name: z.string(),
      direction: z.enum(['owed_to_you', 'you_owe']),
      ...money.shape,
    }),
  ),
  /** Trips the user organises that have not ended; `transfer_to` is who takes over at close. */
  organiser_roles: z.array(
    z.object({
      trip_id: z.uuid(),
      crew_id: z.uuid(),
      trip_name: z.string().nullable(),
      transfer_to: z.uuid().nullable(),
      sole_member: z.boolean(),
    }),
  ),
  active_trip: z.object({ trip_id: z.uuid(), trip_name: z.string().nullable() }).nullable(),
  boost_ious: z.number().int().nonnegative(),
  subscription: z.object({
    source: z.enum(SUBSCRIPTION_SOURCES),
    active: z.boolean(),
    expires_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  open_deletion: z
    .object({
      requested_at: z.iso.datetime({ offset: true }),
      purge_at: z.iso.datetime({ offset: true }),
    })
    .nullable(),
});
export type DeletionPreflight = z.infer<typeof deletionPreflightSchema>;

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

// ---------------------------------------------------------------------------------------------
// Write-off and force purge.

export const writeOffDebtPayloadSchema = z
  .object({
    trip_id: z.uuid().nullable(),
    crew_id: z.uuid(),
    from_uid: z.uuid(),
    to_uid: z.uuid(),
    amount_minor: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export type WriteOffDebtPayload = z.infer<typeof writeOffDebtPayloadSchema>;

export const forcePurgeAccountPayloadSchema = z
  .object({ uid: z.uuid(), reason: z.string().trim().min(3).max(500) })
  .strict();
export type ForcePurgeAccountPayload = z.infer<typeof forcePurgeAccountPayloadSchema>;
