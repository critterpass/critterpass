/**
 * Drizzle mirror of `place_cards` (packages/db/migrations/*_place_cards.sql, the applied source of
 * truth): one card per recommended place (editorial or machine-picked, not hidden, not merged),
 * kept in line with `pois` by the `app.sync_place_card` trigger. The `trip_pack` and `explore`
 * streams read it `AS pois`, so replication never holds the whole open-data catalogue. C0, readable
 * by any signed-in client like `pois`; only the trigger writes it.
 */
import { registerTablePrivacy } from '@cp/domain';
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { destinations } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const placeCards = pgTable('place_cards', {
  /** The place's `pois.id`. */
  id: uuid('id').primaryKey(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  name: text('name').notNull(),
  nameLocal: text('name_local'),
  category: text('category').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  address: text('address'),
  hours: jsonb('hours').notNull(),
  hoursVerifiedAt: instant('hours_verified_at'),
  priceLevel: integer('price_level'),
  editorial: jsonb('editorial').notNull(),
  tags: text('tags').array().notNull(),
  status: text('status').notNull(),
  curation: text('curation').notNull(),
  pickRank: integer('pick_rank'),
  visitRadiusM: integer('visit_radius_m'),
  timezone: text('timezone'),
  lastLiveCheckAt: instant('last_live_check_at'),
  createdAt: instant('created_at').notNull(),
  updatedAt: instant('updated_at').notNull(),
});

registerTablePrivacy('place_cards', { class: 'C0' });
