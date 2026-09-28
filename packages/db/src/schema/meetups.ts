/**
 * Crew live map meet-ups: one active meet-up per trip, the place and time the crew converges on.
 * Typed mirror of packages/db/migrations/*_meetups_and_crew_map_gate.sql, which is the applied
 * source of truth for columns, constraints, RLS (the `app.crew_map_open` gate) and grants — this
 * file is not run through `drizzle-kit generate`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { doublePrecision, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './identity';
import { pois } from './places';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const meetups = pgTable('meetups', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  /** Null when the meet-up is a dropped pin rather than a catalogue place. */
  poiId: uuid('poi_id').references(() => pois.id),
  placeName: text('place_name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  meetAt: instant('meet_at').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  /** `active` | `done` | `cancelled`; at most one active per trip. */
  status: text('status').notNull().default('active'),
  /** uid → ISO instant the member came within the arrival radius. */
  arrived: jsonb('arrived').$type<Record<string, string>>().notNull().default({}),
  /** When every sharing member was first under five minutes away (fires once). */
  allCloseAt: instant('all_close_at'),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('meetups', { class: 'C1' });
