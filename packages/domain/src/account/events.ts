/**
 * Account lifecycle events (docs/api-contracts.md §4.1, §4.9 `write_off_debt`): export, close,
 * restore, purge. Payloads carry ids and enums only; the deletion reason note never leaves its row.
 */
import { z } from 'zod';

export const ACCOUNT_EVENT_TYPES = [
  'account.export_requested',
  'account.export_ready',
  'account.closed',
  'account.restored',
  'account.purge_due_soon',
  'account.purged',
  'trip.organiser_transferred',
  'ledger.written_off',
] as const;
export type AccountEventType = (typeof ACCOUNT_EVENT_TYPES)[number];

const exportRef = z.object({ user_id: z.uuid(), export_id: z.uuid() });
const deletionRef = z.object({ user_id: z.uuid(), deletion_id: z.uuid() });

export const ACCOUNT_EVENT_PAYLOADS = {
  'account.export_requested': exportRef,
  'account.export_ready': exportRef,
  'account.closed': deletionRef.extend({
    instant: z.boolean(),
    source: z.enum(['app', 'web']),
  }),
  'account.restored': deletionRef,
  'account.purge_due_soon': deletionRef,
  // Aggregate is the deletion row; the uid it names is a nameless former member from here on.
  'account.purged': z.object({ deletion_id: z.uuid(), forced: z.boolean() }),
  'trip.organiser_transferred': z.object({
    trip_id: z.uuid(),
    from_id: z.uuid(),
    to_id: z.uuid().nullable(),
    reason: z.enum(['account_closed']),
  }),
  'ledger.written_off': z.object({
    crew_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    from_id: z.uuid(),
    to_id: z.uuid(),
    reason: z.enum(['account_purged', 'payee_forgave']),
  }),
} as const satisfies Record<AccountEventType, z.ZodType>;
