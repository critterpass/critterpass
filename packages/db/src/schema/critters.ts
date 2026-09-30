/**
 * Critters (docs/data-model.md §3.9): eggs, encounters (evidence split into its own C3 table),
 * per-sample dwell rows, the collection, guide skins and crew collection counts. Typed mirror of
 * packages/db/migrations/20261001050000_critters_encounters.sql, the applied source of truth for
 * constraints, RLS and grants. `encounter_samples` has no coordinate column by design.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { registerMergeRule } from '../merge-rules';
import { critterForms, critters, spawnRules } from './content';
import { crews } from './crews';
import { users } from './identity';
import { pois } from './places';
import { guides, trips } from './trips';

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const stamps = () => ({
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

export const eggs = pgTable('eggs', {
  id: id(),
  userId: userId(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => trips.id),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  grantedAt: instant('granted_at').notNull().defaultNow(),
  hatchedAt: instant('hatched_at'),
  /** landed / arrived / manual; set with `hatched_at`. */
  trigger: text('trigger'),
  ...stamps(),
});

export const encounters = pgTable('encounters', {
  /** The client's UUIDv7. */
  id: uuid('id').primaryKey(),
  userId: userId(),
  /** Null only for a home-set encounter (explore at home). */
  tripId: uuid('trip_id').references(() => trips.id),
  spawnRuleId: uuid('spawn_rule_id')
    .notNull()
    .references(() => spawnRules.id),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  poiId: uuid('poi_id').references(() => pois.id),
  state: text('state').notNull().default('accruing'),
  dwellS: integer('dwell_s').notNull().default(0),
  offline: boolean('offline').notNull().default(false),
  startedAt: instant('started_at').notNull(),
  readyAt: instant('ready_at'),
  resolvedAt: instant('resolved_at'),
  verification: text('verification'),
  verifiedAt: instant('verified_at'),
  ...stamps(),
});

export const encounterEvidence = pgTable('encounter_evidence', {
  encounterId: uuid('encounter_id')
    .primaryKey()
    .references(() => encounters.id, { onDelete: 'cascade' }),
  userId: userId(),
  evidence: jsonb('evidence').notNull(),
  attestation: jsonb('attestation').notNull(),
  skewMs: bigint('skew_ms', { mode: 'number' }).notNull().default(0),
  score: jsonb('score'),
  receivedAt: instant('received_at').notNull().defaultNow(),
  expiresAt: instant('expires_at').notNull(),
});

export const encounterSamples = pgTable('encounter_samples', {
  id: id(),
  encounterId: uuid('encounter_id')
    .notNull()
    .references(() => encounters.id, { onDelete: 'cascade' }),
  userId: userId(),
  at: instant('at').notNull(),
  distanceBand: text('distance_band').notNull(),
  accuracyM: real('accuracy_m').notNull(),
  speedMps: real('speed_mps').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export const collectionEntries = pgTable('collection_entries', {
  id: id(),
  userId: userId(),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  critterId: uuid('critter_id')
    .notNull()
    .references(() => critters.id),
  foundAt: instant('found_at').notNull(),
  poiId: uuid('poi_id').references(() => pois.id),
  tripId: uuid('trip_id').references(() => trips.id),
  source: text('source').notNull(),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  verification: text('verification').notNull().default('pending'),
  /** Copied from `critter_names` once verified; null for every form the owner has not found. */
  critterName: text('critter_name'),
  formName: text('form_name'),
  /** Set once `reward.fanout` has announced the find. */
  announcedAt: instant('announced_at'),
  ...stamps(),
});

export const guideSkins = pgTable('guide_skins', {
  id: id(),
  userId: userId(),
  guideId: uuid('guide_id')
    .notNull()
    .references(() => guides.id),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  ...stamps(),
});

export const crewCollectionCounts = pgTable('crew_collection_counts', {
  id: id(),
  crewId: uuid('crew_id')
    .notNull()
    .references(() => crews.id, { onDelete: 'cascade' }),
  userId: userId(),
  critters: integer('critters').notNull().default(0),
  forms: integer('forms').notNull().default(0),
  updatedAt: instant('updated_at').notNull().defaultNow(),
});

registerTablePrivacy('eggs', { class: 'C1' });
registerTablePrivacy('encounters', { class: 'C1' });
registerTablePrivacy('encounter_evidence', { class: 'C3' });
registerTablePrivacy('encounter_samples', { class: 'C3' });
registerTablePrivacy('collection_entries', { class: 'C1' });
registerTablePrivacy('guide_skins', { class: 'C1' });
registerTablePrivacy('crew_collection_counts', { class: 'C1' });

// A merged anonymous user's finds follow them; a form the account already owns keeps the
// account's entry, and a trip egg the account already has keeps the account's. Counts are
// recomputed by trigger, so the merged user's rows are dropped.
registerMergeRule({
  table: 'eggs',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['trip_id'],
});
registerMergeRule({ table: 'encounters', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'encounter_evidence', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'encounter_samples', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({
  table: 'collection_entries',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['form_id'],
});
registerMergeRule({
  table: 'guide_skins',
  userColumn: 'user_id',
  strategy: 'reassign',
  conflictColumns: ['guide_id'],
});
registerMergeRule({ table: 'crew_collection_counts', userColumn: 'user_id', strategy: 'drop' });
