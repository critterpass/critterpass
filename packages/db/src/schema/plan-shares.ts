/**
 * Plan shares with a driver or guide: the no-login page's link and the driver's reply. Typed mirror
 * of packages/db/migrations/*_driver_plan_shares.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  customType,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { changeSets, itineraryVersions } from './plan';
import { providers } from './suppliers';
import { trips } from './trips';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const driverPlanShares = pgTable('driver_plan_shares', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  providerId: uuid('provider_id').references(() => providers.id),
  /** The driver's first name as the crew knows them; never shown on the page. */
  driverName: text('driver_name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  itineraryVersionId: uuid('itinerary_version_id')
    .notNull()
    .references(() => itineraryVersions.id),
  dayNos: smallint('day_nos').array().notNull(),
  /** SHA-256 of the link token: how the page finds its share. */
  tokenHash: bytea('token_hash').notNull().unique(),
  /** The token sealed with the field keyring, so the crew can copy the link again. */
  tokenEnc: text('token_enc').notNull(),
  allowQuote: boolean('allow_quote').notNull().default(true),
  expiresAt: instant('expires_at').notNull(),
  revokedAt: instant('revoked_at'),
  openCount: integer('open_count').notNull().default(0),
  lastOpenedAt: instant('last_opened_at'),
  pdfKey: text('pdf_key'),
  /** The plan version the cached PDF was rendered from. */
  pdfVersionId: uuid('pdf_version_id'),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const driverPlanReplies = pgTable('driver_plan_replies', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  shareId: uuid('share_id')
    .notNull()
    .references(() => driverPlanShares.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  pricePerDayMinor: bigint('price_per_day_minor', { mode: 'bigint' }),
  currency: char('currency', { length: 3 }),
  includes: text('includes')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  overtimePerHourMinor: bigint('overtime_per_hour_minor', { mode: 'bigint' }),
  includedHours: smallint('included_hours'),
  car: text('car'),
  days: jsonb('days').notNull().default([]),
  tips: jsonb('tips').notNull().default([]),
  changeSetId: uuid('change_set_id').references(() => changeSets.id),
  status: text('status').notNull().default('open'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('driver_plan_shares', {
  class: 'C1',
  columns: { token_enc: 'C2', token_hash: 'C2' },
});
registerTablePrivacy('driver_plan_replies', { class: 'C1' });
