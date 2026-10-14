/**
 * Local tour guides (migration 20261014084500_local_guides.sql, the applied source of truth for
 * constraints, RLS and grants). `local_guides` is RLS "R": any signed-in reader may read a listed
 * guide through `GET /v1/destinations/{id}/guides`; only the guides loader writes it. Class C0:
 * only what a guide publishes to sell their guiding, never contact or private details, and no
 * user is linked to it. Not synced.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { destinations } from './trips';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const localGuides = pgTable('local_guides', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** `individual`, `company` or `community`. */
  kind: text('kind').notNull(),
  languages: text('languages').array().notNull().default([]),
  specialties: text('specialties').array().notNull().default([]),
  areas: text('areas').array().notNull().default([]),
  /** `{text, source_url}` as published, or null. */
  price: jsonb('price'),
  profileUrl: text('profile_url').notNull(),
  /** `{en, vi}`. */
  reviewSummary: jsonb('review_summary').notNull().default({}),
  /** `{value, count, platform, url}` from a third-party platform, or null. */
  rating: jsonb('rating'),
  /** `yes`, `no` or `unknown`: whether an official guide licence is shown. */
  licensed: text('licensed').notNull().default('unknown'),
  sources: text('sources').array().notNull().default([]),
  /** `listed`, `hidden` (on request or merged) or `removed` (on request; blanked). */
  status: text('status').notNull().default('listed'),
  mergedIntoId: uuid('merged_into_id').references((): AnyPgColumn => localGuides.id, {
    onDelete: 'set null',
  }),
  loadedAt: at('loaded_at').notNull().defaultNow(),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('local_guides', { class: 'C0' });
