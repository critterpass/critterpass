/**
 * Each setup member's part, crew-visible (C1, system-written; docs/data-model.md, doc delta):
 * whether their free days and their private max are in (flags only, never which days or how
 * much, from `app.recompute_member_setup`), and how they get there (`set_getting_there`).
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { bookings } from './bookings';
import { users } from './identity';
import { trips } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tripMemberSetup = pgTable('trip_member_setup', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  daysIn: boolean('days_in').notNull().default(false),
  maxIn: boolean('max_in').notNull().default(false),
  wayMode: text('way_mode'),
  wayFrom: text('way_from'),
  wayArrivesAt: at('way_arrives_at'),
  wayMinutes: integer('way_minutes'),
  wayEstimateMinor: bigint('way_estimate_minor', { mode: 'bigint' }),
  wayCurrency: char('way_currency', { length: 3 }),
  wayBookingId: uuid('way_booking_id').references(() => bookings.id),
  waySetAt: at('way_set_at'),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('trip_member_setup', { class: 'C1' });

// A member's part follows them into a merged account; where both accounts were on the trip, the
// surviving one's row stays.
registerMergeRule({
  table: 'trip_member_setup',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id'],
});
