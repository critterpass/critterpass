/**
 * Destination itineraries (migration 20261015031000_destination_itineraries.sql, the applied source
 * of truth for constraints, RLS and grants): how itinerary pages lay out a first visit, loaded by
 * the curated places loader. RLS "R": any signed-in reader may read it; only the loader writes it.
 * Class C0, about a destination and no user. Not synced. Read through `destinationItinerary`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { destinations } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const destinationItineraries = pgTable('destination_itineraries', {
  destinationId: uuid('destination_id')
    .primaryKey()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  idealDaysMin: smallint('ideal_days_min').notNull(),
  idealDaysMax: smallint('ideal_days_max').notNull(),
  /** `[{name, character: {en, vi}, places: [{name, poi_id?}]}]`. */
  areas: jsonb('areas').notNull().default([]),
  /** `[{day, theme: {en, vi}, areas: [name], stops: [{name, poi_id?}], source_count}]`. */
  days: jsonb('days').notNull().default([]),
  /** `[{name, travel_minutes, why: {en, vi}}]`. */
  dayTrips: jsonb('day_trips').notNull().default([]),
  /** `{en: [], vi: []}`. */
  tips: jsonb('tips').notNull().default({}),
  bestMonths: text('best_months'),
  /** `[{url, title, kind, lang?, days?}]`. */
  sources: jsonb('sources').notNull().default([]),
  loadedAt: at('loaded_at').notNull().defaultNow(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('destination_itineraries', { class: 'C0' });
