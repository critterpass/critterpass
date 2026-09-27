/**
 * Content catalogue: factory releases, the live catalogue tables the publish job writes from them,
 * critter names (never synced) and opening-hours proposals. Typed mirror of
 * packages/db/migrations/*_content_catalogue.sql, which is the applied source of truth for
 * columns, constraints, RLS and grants. `jsonb` columns carry the item shapes in `@cp/content`.
 */
import { registerTablePrivacy } from '@cp/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { agentJobs } from './ai';
import { pois } from './places';
import { destinations } from './trips';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const ops = pgSchema('ops');

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const stamps = () => ({
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
});

export const contentReleases = pgTable('content_releases', {
  id: id(),
  kind: text('kind').notNull(),
  version: integer('version').notNull(),
  batchKey: text('batch_key').notNull().unique(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  stage: text('stage').notNull().default('brief'),
  gate: text('gate'),
  blockedReason: text('blocked_reason'),
  ipStatus: text('ip_status').notNull().default('not_applicable'),
  checksum: text('checksum').notNull(),
  artifact: jsonb('artifact').notNull(),
  itemCount: integer('item_count').notNull(),
  agentJobId: uuid('agent_job_id').references(() => agentJobs.id),
  notes: text('notes'),
  approvedBy: uuid('approved_by'),
  approvedAt: at('approved_at'),
  publishedAt: at('published_at'),
  ...stamps(),
});

const releaseId = () =>
  uuid('release_id')
    .notNull()
    .references(() => contentReleases.id);

export const critterSets = pgTable('critter_sets', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  rank: smallint('rank'),
  setGroup: smallint('set_group').notNull(),
  tz: text('tz').notNull(),
  currency: text('currency').notNull(),
  languages: text('languages').array().notNull(),
  coverage: text('coverage').notNull(),
  guideSlug: text('guide_slug'),
  destinationId: uuid('destination_id').references(() => destinations.id),
  heroCritterKey: text('hero_critter_key').notNull(),
  monthHints: jsonb('month_hints').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const critters = pgTable('critters', {
  id: id(),
  key: text('key').notNull().unique(),
  setId: uuid('set_id')
    .notNull()
    .references(() => critterSets.id),
  no: smallint('no').notNull().unique(),
  city: text('city').notNull(),
  species: text('species').notNull(),
  artParams: jsonb('art_params').notNull(),
  canonicalSeed: integer('canonical_seed').notNull(),
  note: text('note').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const critterForms = pgTable('critter_forms', {
  id: id(),
  key: text('key').notNull().unique(),
  critterId: uuid('critter_id')
    .notNull()
    .references(() => critters.id),
  rarity: text('rarity').notNull(),
  palette: jsonb('palette').notNull(),
  pose: text('pose'),
  edge: text('edge').notNull(),
  note: text('note').notNull(),
  requirementCopy: text('requirement_copy').notNull(),
  xp: integer('xp').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const critterNames = pgTable('critter_names', {
  id: id(),
  critterId: uuid('critter_id')
    .notNull()
    .references(() => critters.id),
  formId: uuid('form_id').references(() => critterForms.id),
  locale: text('locale').notNull(),
  name: text('name').notNull(),
  nameNative: text('name_native'),
  releaseId: releaseId(),
  ...stamps(),
});

export const legendaryWindows = pgTable('legendary_windows', {
  id: id(),
  key: text('key').notNull().unique(),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  placeLine: text('place_line').notNull(),
  rule: jsonb('rule').notNull(),
  months: smallint('months').array().notNull(),
  solar: text('solar'),
  challenge: text('challenge'),
  sourceUrl: text('source_url'),
  releaseId: releaseId(),
  ...stamps(),
});

export const spawnRules = pgTable('spawn_rules', {
  id: id(),
  key: text('key').notNull().unique(),
  formId: uuid('form_id')
    .notNull()
    .references(() => critterForms.id),
  kind: text('kind').notNull(),
  setId: uuid('set_id')
    .notNull()
    .references(() => critterSets.id),
  destinationId: uuid('destination_id').references(() => destinations.id),
  poiIds: uuid('poi_ids')
    .array()
    .notNull()
    .default(sql`'{}'`),
  geofences: jsonb('geofences')
    .notNull()
    .default(sql`'[]'::jsonb`),
  n: smallint('n'),
  dwellS: integer('dwell_s').notNull().default(300),
  holdMs: integer('hold_ms'),
  windowId: uuid('window_id').references(() => legendaryWindows.id),
  solar: text('solar'),
  minMembers: smallint('min_members'),
  foregroundOnly: boolean('foreground_only').notNull().default(false),
  copy: text('copy').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const phraseCards = pgTable('phrase_cards', {
  id: id(),
  key: text('key').notNull().unique(),
  language: text('language').notNull(),
  context: text('context').notNull(),
  text: text('text').notNull(),
  romanisation: text('romanisation'),
  gloss: text('gloss').notNull(),
  audioKey: text('audio_key'),
  audioStatus: text('audio_status').notNull(),
  nativeReviewedOn: date('native_reviewed_on'),
  releaseId: releaseId(),
  ...stamps(),
});

export const emergencyNumbers = pgTable('emergency_numbers', {
  id: id(),
  country: text('country').notNull().unique(),
  numbers: jsonb('numbers').notNull(),
  sourceUrl: text('source_url').notNull(),
  retrievedOn: date('retrieved_on').notNull(),
  verifiedAt: at('verified_at').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const facilities = pgTable('facilities', {
  id: id(),
  key: text('key').notNull().unique(),
  destinationId: uuid('destination_id')
    .notNull()
    .references(() => destinations.id),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  address: text('address').notNull(),
  phone: text('phone'),
  open24h: boolean('open_24h'),
  sourceUrl: text('source_url').notNull(),
  retrievedOn: date('retrieved_on').notNull(),
  verifiedAt: at('verified_at').notNull(),
  releaseId: releaseId(),
  ...stamps(),
});

export const helpArticles = pgTable('help_articles', {
  id: id(),
  slug: text('slug').notNull(),
  locale: text('locale').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  bodyMd: text('body_md').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  fts: tsvector('fts'),
  releaseId: releaseId(),
  ...stamps(),
});

export const poiHoursProposals = pgTable('poi_hours_proposals', {
  id: id(),
  poiId: uuid('poi_id')
    .notNull()
    .references(() => pois.id),
  hours: jsonb('hours').notNull(),
  sourceUrl: text('source_url').notNull(),
  fetchedAt: at('fetched_at').notNull(),
  batchKey: text('batch_key').notNull(),
  status: text('status').notNull().default('proposed'),
  decidedBy: uuid('decided_by'),
  decidedAt: at('decided_at'),
  ...stamps(),
});

export const opsContentReviews = ops.table('content_reviews', {
  id: id(),
  releaseId: releaseId(),
  itemRef: text('item_ref').notNull(),
  renderKey: text('render_key'),
  severity: text('severity').notNull(),
  report: jsonb('report')
    .notNull()
    .default(sql`'[]'::jsonb`),
  verdict: text('verdict').notNull().default('pending'),
  reviewer: uuid('reviewer'),
  notes: text('notes'),
  reviewedAt: at('reviewed_at'),
  ...stamps(),
});

for (const table of [
  'content_releases',
  'critter_sets',
  'critters',
  'critter_forms',
  'critter_names',
  'legendary_windows',
  'spawn_rules',
  'phrase_cards',
  'emergency_numbers',
  'facilities',
  'help_articles',
  'poi_hours_proposals',
]) {
  registerTablePrivacy(table, { class: 'C0' });
}
