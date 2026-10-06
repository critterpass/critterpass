/**
 * The console's account-deletion contracts (docs/api-contracts.md §4.17): what support sees of a
 * traveller's deletion requests and their last "Download my data" export, the list of deletions,
 * and the owner's command that ends a grace window early for a legal erasure request. Ids, dates
 * and enums only: the reason a traveller gave for leaving is theirs, and is not shown.
 */
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });

/** Where one deletion request stands. */
export const ACCOUNT_DELETION_STATES = ['requested', 'restored', 'purged'] as const;
export type AccountDeletionState = (typeof ACCOUNT_DELETION_STATES)[number];

export function accountDeletionState(row: {
  restored_at: unknown;
  purged_at: unknown;
}): AccountDeletionState {
  if (row.purged_at !== null) return 'purged';
  return row.restored_at !== null ? 'restored' : 'requested';
}

export const adminAccountDeletionSchema = z.object({
  id: z.uuid(),
  uid: z.uuid(),
  state: z.enum(ACCOUNT_DELETION_STATES),
  source: z.string(),
  requested_at: isoDate,
  purge_at: isoDate,
  restored_at: isoDate.nullable(),
  purged_at: isoDate.nullable(),
});
export type AdminAccountDeletion = z.infer<typeof adminAccountDeletionSchema>;

export const adminUserDeletionSchema = z.object({
  /** `none` when the traveller never asked to delete; else the latest request's state. */
  state: z.enum(['none', ...ACCOUNT_DELETION_STATES]),
  /** Newest first. */
  deletions: z.array(adminAccountDeletionSchema),
  last_export: z
    .object({
      id: z.uuid(),
      status: z.string(),
      requested_at: isoDate,
      ready_at: isoDate.nullable(),
      expires_at: isoDate.nullable(),
    })
    .nullable(),
});
export type AdminUserDeletion = z.infer<typeof adminUserDeletionSchema>;

export const adminAccountDeletionsQuerySchema = z.object({
  state: z.enum(ACCOUNT_DELETION_STATES).default('requested'),
});
export const adminAccountDeletionsResponseSchema = z.object({
  items: z.array(adminAccountDeletionSchema),
});

/** Ends a closed account's grace window now; the hourly purge takes it on its next pass. */
export const forcePurgeAccountPayloadSchema = z.object({
  uid: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export type ForcePurgeAccountPayload = z.infer<typeof forcePurgeAccountPayloadSchema>;
