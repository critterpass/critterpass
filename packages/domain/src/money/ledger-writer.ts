/**
 * The ledger entry contract every writer shares (expenses, payments, and the Boost split's IOUs):
 * a positive amount one member owes another in the crew's settlement currency, and the source it
 * came from. The api's `writeLedgerEntries` (services/api/src/money/ledger.ts) validates every
 * entry against this before inserting; entries are never updated, only reversed.
 */
import { z } from 'zod';

import { currencyCodeSchema } from './expense-schema';

export const LEDGER_ENTRY_SOURCE_KINDS = [
  'expense',
  'payment',
  'boost_iou',
  'adjustment',
  'reversal',
] as const;
export const ledgerEntrySourceKindSchema = z.enum(LEDGER_ENTRY_SOURCE_KINDS);
export type LedgerEntrySourceKind = z.infer<typeof ledgerEntrySourceKindSchema>;

export const ledgerEntryDraftSchema = z
  .strictObject({
    crew_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    debtor_id: z.uuid(),
    creditor_id: z.uuid(),
    amount_minor: z.bigint().positive(),
    currency: currencyCodeSchema,
    source_kind: ledgerEntrySourceKindSchema,
    source_id: z.uuid(),
    reverses_id: z.uuid().nullable(),
  })
  .refine((entry) => entry.debtor_id !== entry.creditor_id, {
    message: 'a member cannot owe themselves',
  })
  .refine((entry) => (entry.source_kind === 'reversal') === (entry.reverses_id !== null), {
    message: 'a reversal, and only a reversal, points at the entry it reverses',
  });
export type LedgerEntryDraftWire = z.infer<typeof ledgerEntryDraftSchema>;
