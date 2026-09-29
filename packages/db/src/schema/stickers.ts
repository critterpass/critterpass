/**
 * Stickers (docs/data-model.md §3.9): non-critter rewards such as the Settled Tokek, granted by the
 * server and never part of the dex.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { crews } from './crews';
import { users } from './identity';
import { trips } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const stickers = pgTable('stickers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: uuid('user_id').references(() => users.id),
  crewId: uuid('crew_id').references(() => crews.id),
  tripId: uuid('trip_id').references(() => trips.id),
  kind: text('kind').notNull(),
  grantedAt: at('granted_at').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
});

registerTablePrivacy('stickers', { class: 'C1' });
