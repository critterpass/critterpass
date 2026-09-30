/**
 * Editorial media: licensed stock photos and video loops for destination and place heroes, with
 * their licence, credit and the files the ingest job stored under the public `c/media/<id>/`
 * prefix. Typed mirror of packages/db/migrations/*_media_assets.sql, the applied source of truth
 * for constraints, RLS and grants.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { contentReleases } from './content';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export interface MediaVariantRow {
  readonly key: string;
  readonly format: 'webp' | 'mp4';
  readonly w: number;
  readonly h: number;
  readonly bytes: number;
}

export const mediaAssets = pgTable('media_assets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  kind: text('kind').notNull(),
  source: text('source').notNull(),
  sourceId: text('source_id').notNull(),
  sourceUrl: text('source_url').notNull(),
  downloadUrl: text('download_url').notNull(),
  subjectKeys: text('subject_keys').array().notNull(),
  rank: smallint('rank').notNull().default(0),
  title: text('title'),
  author: text('author').notNull(),
  authorUrl: text('author_url'),
  licence: text('licence').notNull(),
  licenceUrl: text('licence_url').notNull(),
  attributionRequired: boolean('attribution_required').notNull(),
  credit: text('credit').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationMs: integer('duration_ms'),
  colour: text('colour'),
  blurhash: text('blurhash'),
  variants: jsonb('variants').$type<MediaVariantRow[]>().notNull().default([]),
  posterKey: text('poster_key'),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  releaseId: uuid('release_id').references(() => contentReleases.id),
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('media_assets', { class: 'C0' });
