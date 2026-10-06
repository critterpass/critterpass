/**
 * AI place profiles and the shared search pace (migrations 20261006020000_place_profiles.sql and
 * 20261006093500_place_profiles_basis.sql, the applied source of truth for constraints, RLS and
 * grants). `place_profiles` is RLS "R": any signed-in reader may read a place's profile through the
 * api; only the worker writes it. Neither table is synced. Shapes of the jsonb columns: `@cp/domain`
 * `places/place-profile.ts`.
 */
import { registerTablePrivacy } from '@cp/domain';
import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { pois } from './places';

export const placeProfiles = pgTable('place_profiles', {
  poiId: uuid('poi_id')
    .primaryKey()
    .references(() => pois.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  /** `web` (the profile job) or `reviewed_note` (typed fields only; the note keeps the prose). */
  basis: text('basis').notNull().default('web'),
  texts: jsonb('texts').notNull().default({}),
  category: text('category'),
  mealRole: text('meal_role'),
  bestTimes: text('best_times').array().notNull().default([]),
  visitMin: smallint('visit_min'),
  dish: text('dish'),
  facts: jsonb('facts').notNull().default([]),
  droppedFacts: jsonb('dropped_facts').notNull().default([]),
  sources: jsonb('sources').notNull().default([]),
  secondSource: jsonb('second_source'),
  photos: jsonb('photos').notNull().default([]),
  model: text('model'),
  costMicros: bigint('cost_micros', { mode: 'number' }).notNull().default(0),
  timings: jsonb('timings').notNull().default({}),
  error: text('error'),
  requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

registerTablePrivacy('place_profiles', { class: 'C0' });

export const placeSearchPace = pgTable('place_search_pace', {
  id: boolean('id').primaryKey().default(true),
  nextAt: timestamp('next_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});

registerTablePrivacy('place_search_pace', { class: 'C0' });
