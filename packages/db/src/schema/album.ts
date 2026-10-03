/**
 * The crew's shared trip album and its postcards (docs/data-model.md §3.10). Typed mirror of
 * packages/db/migrations/*_album_postcards.sql, the applied source of truth for constraints, RLS
 * and grants. Photo bytes live in R2 (`media_objects`), never here; no face data is stored anywhere.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { users } from './identity';
import { trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const tripRef = () =>
  uuid('trip_id')
    .notNull()
    .references(() => trips.id);
const userRef = (name: string) =>
  uuid(name)
    .notNull()
    .references(() => users.id);
const stamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const photos = pgTable('photos', {
  /** The app's own id: a photo is created offline, before its upload. */
  id: uuid('id').primaryKey(),
  tripId: tripRef(),
  uploaderId: userRef('uploader_id'),
  mediaKey: text('media_key').notNull(),
  thumbKey: text('thumb_key'),
  displayKey: text('display_key'),
  takenAt: instant('taken_at'),
  /** The trip-clock day the photo was taken (the album's day sections). */
  localDate: date('local_date', { mode: 'string' }),
  sha256: text('sha256').notNull(),
  phash: text('phash'),
  width: integer('width'),
  height: integer('height'),
  /** The device prefilter's scores (`@cp/domain` `photoQualitySchema`). */
  quality: jsonb('quality').notNull().default({}),
  exifGpsStripped: boolean('exif_gps_stripped').notNull().default(false),
  /** `pending`, `uploaded`, `processed` or `failed`. */
  uploadState: text('upload_state').notNull().default('uploaded'),
  isPick: boolean('is_pick').notNull().default(false),
  facesOptIn: boolean('faces_opt_in').notNull().default(false),
  deletedAt: instant('deleted_at'),
  ...stamps(),
});

export const albumPicks = pgTable('album_picks', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: tripRef(),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  /** False: a traveller took the photo out of the picks (the guide keeps away from it). */
  picked: boolean('picked').notNull().default(true),
  /** `user` or `guide`. */
  pickedBy: text('picked_by').notNull(),
  pickerId: uuid('picker_id').references(() => users.id),
  rank: smallint('rank'),
  ...stamps(),
});

export const photoPeople = pgTable('photo_people', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  tripId: tripRef(),
  userId: userRef('user_id'),
  /** `self_match` or `manual`. */
  source: text('source').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const albumPrefs = pgTable('album_prefs', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: tripRef(),
  userId: userRef('user_id'),
  autoIngest: boolean('auto_ingest').notNull().default(false),
  ...stamps(),
});

export const albumExports = pgTable('album_exports', {
  id: uuid('id').primaryKey(),
  tripId: tripRef(),
  userId: userRef('user_id'),
  /** `queued`, `ready`, `failed` or `expired`. */
  status: text('status').notNull().default('queued'),
  mediaKey: text('media_key'),
  photos: integer('photos'),
  bytes: bigint('bytes', { mode: 'number' }),
  expiresAt: instant('expires_at'),
  ...stamps(),
});

export const postcards = pgTable('postcards', {
  id: uuid('id').primaryKey(),
  tripId: tripRef(),
  photoId: uuid('photo_id').references(() => photos.id, { onDelete: 'set null' }),
  note: text('note').notNull().default(''),
  /** `classic`, `square` or `story`. */
  format: text('format').notNull().default('classic'),
  createdBy: userRef('created_by'),
  sentAt: instant('sent_at'),
  deletedAt: instant('deleted_at'),
  version: integer('version').notNull().default(1),
  ...stamps(),
});

export const postcardMailings = pgTable('postcard_mailings', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  postcardId: uuid('postcard_id')
    .notNull()
    .references(() => postcards.id),
  tripId: tripRef(),
  payerId: userRef('payer_id'),
  recipientIds: uuid('recipient_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  vendor: text('vendor').notNull(),
  vendorRef: text('vendor_ref'),
  /** `queued`, `sent`, `printed`, `shipped` or `failed`. */
  status: text('status').notNull().default('queued'),
  tracking: jsonb('tracking').notNull().default({}),
  ...stamps(),
});

export const mailingAddresses = pgTable('mailing_addresses', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: userRef('user_id').unique(),
  /** AES-256-GCM envelope (packages/db crypto); never decrypted outside the print job. */
  fieldsEnc: text('fields_enc').notNull(),
  country: char('country', { length: 2 }).notNull(),
  ...stamps(),
});

export const albumCurations = pgTable('album_curations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  tripId: tripRef().unique(),
  /** The guide's line over its picks, from computed facts only. */
  note: text('note').notNull(),
  picks: integer('picks').notNull(),
  photos: integer('photos').notNull(),
  noteFallback: boolean('note_fallback').notNull().default(false),
  curatedAt: instant('curated_at').notNull().defaultNow(),
  ...stamps(),
});

registerTablePrivacy('photos', { class: 'C1' });
registerTablePrivacy('album_curations', { class: 'C1' });
registerTablePrivacy('album_picks', { class: 'C1' });
registerTablePrivacy('photo_people', { class: 'C1' });
registerTablePrivacy('album_prefs', { class: 'C2' });
registerTablePrivacy('album_exports', { class: 'C2' });
registerTablePrivacy('postcards', { class: 'C1' });
registerTablePrivacy('postcard_mailings', { class: 'C2' });
registerTablePrivacy('mailing_addresses', { class: 'C3' });

// A merged user keeps the account's own row where both have one (one tag per photo, one set of
// album settings per trip, one address).
registerMergeRule({ table: 'photos', userColumn: 'uploader_id', strategy: 'reassign' });
registerMergeRule({
  table: 'photo_people',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['photo_id'],
});
registerMergeRule({
  table: 'album_prefs',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id'],
});
registerMergeRule({ table: 'album_exports', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'postcards', userColumn: 'created_by', strategy: 'reassign' });
registerMergeRule({ table: 'postcard_mailings', userColumn: 'payer_id', strategy: 'reassign' });
registerMergeRule({ table: 'mailing_addresses', userColumn: 'user_id', strategy: 'keep_existing' });
