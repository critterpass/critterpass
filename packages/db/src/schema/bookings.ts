/**
 * The trip wallet (docs/data-model.md §3.7), a typed mirror of the bookings migrations: bookings and
 * their documents, flight segments and their status watches, import candidates and the inbound
 * mail that feeds them, the crews' forward addresses and linked senders, mailbox connections and
 * the travel-insurance vault. Secrets (barcodes, OAuth tokens, policy numbers) are AES-256-GCM
 * envelopes from `packages/db/crypto`; sender and message ids are peppered hashes.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { consents, users } from './identity';
import { trips } from './trips';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const userRef = (name: string) => uuid(name).references(() => users.id);
const tripRef = () => uuid('trip_id').references(() => trips.id);
const createdAt = () => at('created_at').notNull().defaultNow();
const updatedAt = () => at('updated_at').notNull().defaultNow();

export const bookings = pgTable('bookings', {
  id: id(),
  tripId: tripRef().notNull(),
  ownerId: userRef('owner_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  startsAt: at('starts_at'),
  endsAt: at('ends_at'),
  tz: text('tz'),
  location: text('location'),
  travellerIds: uuid('traveller_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  paidBy: userRef('paid_by'),
  source: text('source').notNull().default('manual'),
  supplier: text('supplier').notNull().default('other'),
  supplierRef: text('supplier_ref'),
  freeCancelUntil: at('free_cancel_until'),
  cancelPolicyText: text('cancel_policy_text'),
  status: text('status').notNull().default('booked'),
  visibility: text('visibility').notNull(),
  flightCrewVisible: boolean('flight_crew_visible').notNull().default(true),
  details: jsonb('details')
    .notNull()
    .default(sql`'{}'::jsonb`),
  barcodePayloadEnc: text('barcode_payload_enc'),
  barcodeFormat: text('barcode_format'),
  supplierOrderId: uuid('supplier_order_id'),
  deletedAt: at('deleted_at'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const bookingAttachments = pgTable('booking_attachments', {
  id: id(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  tripId: tripRef().notNull(),
  ownerId: userRef('owner_id').notNull(),
  crewVisible: boolean('crew_visible').notNull(),
  mediaKey: text('media_key').notNull(),
  kind: text('kind').notNull(),
  sha256: text('sha256'),
  createdAt: createdAt(),
});

export const flightSegments = pgTable('flight_segments', {
  id: id(),
  bookingId: uuid('booking_id')
    .notNull()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  tripId: tripRef().notNull(),
  ownerId: userRef('owner_id').notNull(),
  crewVisible: boolean('crew_visible').notNull(),
  segmentNo: smallint('segment_no').notNull().default(1),
  carrier: text('carrier').notNull(),
  flightNo: text('flight_no').notNull(),
  depAirport: char('dep_airport', { length: 3 }).notNull(),
  arrAirport: char('arr_airport', { length: 3 }).notNull(),
  schedDepAt: at('sched_dep_at').notNull(),
  schedArrAt: at('sched_arr_at'),
  estDepAt: at('est_dep_at'),
  estArrAt: at('est_arr_at'),
  actDepAt: at('act_dep_at'),
  actArrAt: at('act_arr_at'),
  boardingAt: at('boarding_at'),
  boardingEstimated: boolean('boarding_estimated').notNull().default(true),
  gate: text('gate'),
  terminal: text('terminal'),
  status: text('status').notNull().default('scheduled'),
  delayMin: integer('delay_min'),
  statusSource: text('status_source').notNull().default('schedule'),
  statusAt: at('status_at'),
  laPhase: text('la_phase'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const flightWatches = pgTable('flight_watches', {
  id: id(),
  flightSegmentId: uuid('flight_segment_id')
    .notNull()
    .references(() => flightSegments.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerAlertId: text('provider_alert_id').notNull(),
  providerFlightId: text('provider_flight_id'),
  activeUntil: at('active_until').notNull(),
  endedAt: at('ended_at'),
  createdAt: createdAt(),
});

export const crewInboundAddresses = pgTable('crew_inbound_addresses', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  localPart: text('local_part').notNull().unique(),
  status: text('status').notNull().default('active'),
  rotatedAt: at('rotated_at'),
  /** Forwarded mail held from addresses nobody in the crew has linked yet, and the newest's time. */
  heldCount: integer('held_count').notNull().default(0),
  heldAt: at('held_at'),
  /** Latest expiry of a link code that was emailed for the held mail; null when none went out. */
  heldCodeUntil: at('held_code_until'),
  createdAt: createdAt(),
});

export const inboundSenderLinks = pgTable('inbound_sender_links', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id),
  userId: userRef('user_id'),
  senderHash: text('sender_hash').notNull(),
  codeHash: text('code_hash'),
  codeExpiresAt: at('code_expires_at'),
  /** The Worker's report on the code's reply: pending, sent or failed (null: issued before reports). */
  codeDelivery: text('code_delivery'),
  attempts: smallint('attempts').notNull().default(0),
  verifiedAt: at('verified_at'),
  createdAt: createdAt(),
});

export const inboundEmails = pgTable('inbound_emails', {
  id: id(),
  addressId: uuid('address_id')
    .notNull()
    .references(() => crewInboundAddresses.id),
  crewId: uuid('crew_id').references(() => crews.id),
  userId: userRef('user_id'),
  senderHash: text('sender_hash').notNull(),
  messageIdHash: text('message_id_hash').notNull(),
  r2Key: text('r2_key'),
  sizeBytes: integer('size_bytes').notNull(),
  dkim: text('dkim').notNull(),
  spf: text('spf').notNull(),
  status: text('status').notNull(),
  quarantineReason: text('quarantine_reason'),
  rawPurgedAt: at('raw_purged_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const importCandidates = pgTable('import_candidates', {
  id: id(),
  userId: userRef('user_id').notNull(),
  crewId: uuid('crew_id').references(() => crews.id),
  tripId: tripRef(),
  source: text('source').notNull(),
  extracted: jsonb('extracted'),
  confidence: real('confidence'),
  dedupeKey: text('dedupe_key').notNull(),
  status: text('status').notNull().default('parsing'),
  crewVisible: boolean('crew_visible').notNull().default(false),
  needsConfirm: boolean('needs_confirm').notNull().default(false),
  failureReason: text('failure_reason'),
  duplicateOfId: uuid('duplicate_of_id'),
  bookingId: uuid('booking_id').references(() => bookings.id),
  inboundEmailId: uuid('inbound_email_id').references(() => inboundEmails.id),
  resolvedBy: userRef('resolved_by'),
  resolvedAt: at('resolved_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const mailboxConnections = pgTable('mailbox_connections', {
  id: id(),
  userId: userRef('user_id').notNull(),
  provider: text('provider').notNull(),
  scopes: text('scopes').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  lastHistoryId: text('last_history_id'),
  status: text('status').notNull().default('active'),
  lastScanAt: at('last_scan_at'),
  lastError: text('last_error'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const insurancePolicies = pgTable('insurance_policies', {
  id: id(),
  userId: userRef('user_id').notNull(),
  tripId: tripRef(),
  provider: text('provider').notNull(),
  policyNoEnc: text('policy_no_enc').notNull(),
  assistancePhoneEnc: text('assistance_phone_enc'),
  docMediaKey: text('doc_media_key'),
  shareWithClinicConsentId: uuid('share_with_clinic_consent_id').references(() => consents.id),
  deletedAt: at('deleted_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// The booking itself is crew-visible data (C1) once shared; the barcode is its traveller's (C2).
registerTablePrivacy('bookings', { class: 'C1', columns: { barcode_payload_enc: 'C2' } });
registerTablePrivacy('booking_attachments', { class: 'C2' });
registerTablePrivacy('flight_segments', { class: 'C1' });
registerTablePrivacy('flight_watches', { class: 'C2' });
registerTablePrivacy('crew_inbound_addresses', { class: 'C2' });
registerTablePrivacy('import_candidates', { class: 'C2' });
// Linked senders and inbound mail name a person's mailbox (hashed); the raw mail sits in R2 for 7 d.
// Generic columns are classed C2 so log redaction keeps keys such as `status` readable.
registerTablePrivacy('inbound_sender_links', { class: 'C3', columns: { attempts: 'C2' } });
registerTablePrivacy('inbound_emails', {
  class: 'C3',
  columns: { status: 'C2', dkim: 'C2', spf: 'C2', size_bytes: 'C2', quarantine_reason: 'C2' },
});
registerTablePrivacy('mailbox_connections', {
  class: 'C3',
  columns: { provider: 'C2', status: 'C2', scopes: 'C2', last_error: 'C2' },
});
registerTablePrivacy('insurance_policies', { class: 'C3', columns: { provider: 'C2' } });
