/**
 * The crew money ledger (docs/data-model.md §3.8), a typed mirror of the money migrations:
 * expenses, their shares and edit history, the append-only ledger, payments, receipts and the
 * encrypted payout methods. Integer minor units only; `bigint` columns map to JS `bigint`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { fxSnapshots } from './fx';
import { users } from './identity';
import { pois } from './places';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const minor = (name: string) => bigint(name, { mode: 'bigint' });
const currency = (name: string) => char(name, { length: 3 });
const userRef = (name: string) => uuid(name).references(() => users.id);
const crewRef = () =>
  uuid('crew_id')
    .notNull()
    .references(() => crews.id);
const tripRef = () => uuid('trip_id').references(() => trips.id);
const version = () => integer('version').notNull().default(1);
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const expenses = pgTable('expenses', {
  id: id(),
  crewId: crewRef(),
  tripId: tripRef().notNull(),
  payerId: userRef('payer_id').notNull(),
  amountMinor: minor('amount_minor').notNull(),
  currency: currency('currency').notNull(),
  fxSnapshotId: uuid('fx_snapshot_id').references(() => fxSnapshots.id),
  crewAmountMinor: minor('crew_amount_minor').notNull(),
  crewCurrency: currency('crew_currency').notNull(),
  splitMode: text('split_mode').notNull(),
  category: text('category').notNull().default('other'),
  description: text('description').notNull().default(''),
  merchant: text('merchant'),
  localDate: date('local_date', { mode: 'string' }).notNull(),
  tripDay: smallint('trip_day'),
  spentAt: at('spent_at').notNull(),
  poiId: uuid('poi_id').references(() => pois.id),
  bookingId: uuid('booking_id'),
  rideId: uuid('ride_id'),
  boostId: uuid('boost_id'),
  receiptId: uuid('receipt_id'),
  source: text('source').notNull().default('manual'),
  createdBy: userRef('created_by').notNull(),
  deletedAt: at('deleted_at'),
  deletedBy: userRef('deleted_by'),
  version: version(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const expenseShares = pgTable('expense_shares', {
  id: id(),
  expenseId: uuid('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  tripId: tripRef().notNull(),
  userId: userRef('user_id').notNull(),
  weight: integer('weight').notNull().default(1),
  fixedMinor: minor('fixed_minor'),
  computedMinor: minor('computed_minor').notNull(),
  crewComputedMinor: minor('crew_computed_minor').notNull(),
  excludedReason: text('excluded_reason'),
  createdAt: createdAt(),
});

export const expenseEdits = pgTable('expense_edits', {
  id: id(),
  expenseId: uuid('expense_id')
    .notNull()
    .references(() => expenses.id),
  tripId: tripRef().notNull(),
  editorId: userRef('editor_id').notNull(),
  kind: text('kind').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  at: at('at').notNull().defaultNow(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: id(),
  crewId: crewRef(),
  tripId: tripRef(),
  debtorId: userRef('debtor_id').notNull(),
  creditorId: userRef('creditor_id').notNull(),
  amountMinor: minor('amount_minor').notNull(),
  currency: currency('currency').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceId: uuid('source_id').notNull(),
  reversesId: uuid('reverses_id'),
  createdAt: createdAt(),
});

export const payments = pgTable('payments', {
  id: id(),
  crewId: crewRef(),
  tripId: tripRef(),
  fromId: userRef('from_id').notNull(),
  toId: userRef('to_id').notNull(),
  amountMinor: minor('amount_minor').notNull(),
  currency: currency('currency').notNull(),
  method: text('method'),
  status: text('status').notNull().default('pending'),
  requestedAt: at('requested_at'),
  lastNudgedAt: at('last_nudged_at'),
  markedAt: at('marked_at'),
  confirmedAt: at('confirmed_at'),
  autoConfirmed: boolean('auto_confirmed').notNull().default(false),
  disputedAt: at('disputed_at'),
  disputeNote: text('dispute_note'),
  reissuedFromId: uuid('reissued_from_id'),
  createdBy: userRef('created_by').notNull(),
  version: version(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const receipts = pgTable('receipts', {
  id: id(),
  userId: userRef('user_id').notNull(),
  tripId: tripRef().notNull(),
  crewId: crewRef(),
  expenseId: uuid('expense_id').references(() => expenses.id),
  mediaKey: text('media_key'),
  status: text('status').notNull().default('queued'),
  qualityIssue: text('quality_issue'),
  ocrSource: text('ocr_source').notNull().default('device'),
  ocrLines: jsonb('ocr_lines')
    .notNull()
    .default(sql`'[]'::jsonb`),
  parsed: jsonb('parsed'),
  suggestions: jsonb('suggestions'),
  failureReason: text('failure_reason'),
  parsedAt: at('parsed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const payoutMethods = pgTable('payout_methods', {
  id: id(),
  userId: userRef('user_id').notNull(),
  kind: text('kind').notNull(),
  country: char('country', { length: 2 }),
  label: text('label').notNull().default(''),
  detailsEnc: text('details_enc'),
  deletedAt: at('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

for (const table of ['expenses', 'expense_shares', 'expense_edits', 'ledger_entries', 'payments']) {
  registerTablePrivacy(table, { class: 'C1' });
}
registerTablePrivacy('receipts', { class: 'C2' });
// The details are C3; the method's kind and country are what the crew's settle screen already
// shows ("HOW PEOPLE PAY YOU"), classed C2 so the log redaction list keeps generic keys readable.
registerTablePrivacy('payout_methods', { class: 'C3', columns: { kind: 'C2', country: 'C2' } });
