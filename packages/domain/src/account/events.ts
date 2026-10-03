/**
 * Account lifecycle events (docs/api-contracts.md §4.1): close, restore, purge, and the organiser
 * hand-over a close causes, and a data export asked for and ready. Payloads carry ids and enums only.
 */
import { z } from 'zod';

export const ACCOUNT_EVENT_TYPES = [
  'account.closed',
  'account.restored',
  'account.purged',
  'trip.organiser_transferred',
  'data_export.requested',
  'data_export.ready',
] as const;
export type AccountEventType = (typeof ACCOUNT_EVENT_TYPES)[number];

const deletionRef = z.object({ user_id: z.uuid(), deletion_id: z.uuid() });

export const ACCOUNT_EVENT_PAYLOADS = {
  'account.closed': deletionRef.extend({
    instant: z.boolean(),
    source: z.enum(['app', 'web']),
  }),
  'account.restored': deletionRef,
  // Aggregate is the deletion row; the uid it names is a nameless former member from here on.
  'account.purged': z.object({ deletion_id: z.uuid(), forced: z.boolean() }),
  'trip.organiser_transferred': z.object({
    trip_id: z.uuid(),
    from_id: z.uuid(),
    to_id: z.uuid().nullable(),
    reason: z.enum(['account_closed']),
  }),
  'data_export.requested': z.object({ user_id: z.uuid(), export_id: z.uuid() }),
  'data_export.ready': z.object({ user_id: z.uuid(), export_id: z.uuid() }),
} as const satisfies Record<AccountEventType, z.ZodType>;
