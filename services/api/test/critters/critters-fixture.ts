/**
 * A published critter set for a destination (two critters, their forms and names, a presence
 * spawn at a POI, a dated legendary window) and a trip to it that is under way, with two
 * travellers who boarded and one crewmate who dropped out.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';

export const TRIP_TZ = 'Asia/Ho_Chi_Minh';

export interface CritterFixture {
  readonly maya: SignedIn;
  readonly rin: SignedIn;
  readonly dropout: SignedIn;
  readonly tripId: string;
  readonly poiId: string;
  readonly starterFormId: string;
  readonly rareFormId: string;
  readonly ruleId: string;
  readonly windowId: string;
  readonly guideId: string;
}

export function localDate(tz: string, offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

const TO_IN_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
];

async function one(tx: pg.PoolClient, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(sql, params);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from: ${sql}`);
  return id;
}

export async function seedCritterContent(
  tx: pg.PoolClient,
  approver: string,
): Promise<{
  destinationId: string;
  poiId: string;
  starter: string;
  rare: string;
  rule: string;
  window: string;
  guide: string;
}> {
  const tag = randomUUID().slice(0, 8);
  const release = await one(
    tx,
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('forms', 1, $1, 'Test set', 'published', 'publish', repeat('0', 64), '{}', 0, $2, now(), now())
     RETURNING id`,
    [`test-${tag}`, approver],
  );
  const destinationId = await one(
    tx,
    "INSERT INTO destinations (slug, name, country, tz) VALUES ($1, 'Da Nang', 'VN', $2) RETURNING id",
    [`da-nang-${tag}`, TRIP_TZ],
  );
  const setId = await one(
    tx,
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       hero_critter_key, month_hints, destination_id, release_id)
     VALUES ($1, 'Da Nang', 'VN', 1, $2, 'VND', '{vi}', 'live', 'cp-801', '[]', $3, $4) RETURNING id`,
    [`dn-${tag}`, TRIP_TZ, destinationId, release],
  );
  await tx.query('UPDATE destinations SET critter_set_id = $2 WHERE id = $1', [
    destinationId,
    setId,
  ]);
  const critter = async (no: number) =>
    one(
      tx,
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, 'Da Nang', 'Gecko', '{}', 7, 'Test.', $4) RETURNING id`,
      [`cp-${no}`, setId, no, release],
    );
  const [first, second] = [await critter(801), await critter(802)];
  const form = async (critterId: string, key: string, rarity: string) =>
    one(
      tx,
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
       VALUES ($1, $2, $3, '{}', 'none', 'Test.', 'Be there', 10, $4) RETURNING id`,
      [key, critterId, rarity, release],
    );
  const starter = await form(first, 'cp-801:common', 'common');
  const rare = await form(second, 'cp-802:rare', 'rare');
  const legendary = await form(second, 'cp-802:legendary', 'legendary');
  await tx.query(
    `INSERT INTO critter_names (critter_id, form_id, locale, name, release_id)
     VALUES ($1, NULL, 'en', 'Chava', $4), ($1, $2, 'en', 'Chava', $4), ($3, NULL, 'en', 'Bridget', $4)`,
    [first, starter, second, release],
  );
  const poiId = await one(
    tx,
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Dragon Bridge', 'landmark', 16.0612, 108.2270) RETURNING id`,
    [destinationId],
  );
  const rule = await one(
    tx,
    `INSERT INTO spawn_rules (key, form_id, kind, set_id, destination_id, poi_ids, dwell_s, copy, release_id)
     VALUES ('cp-802:rare#1', $1, 'presence', $2, $3, ARRAY[$4::uuid], 300, 'At the bridge', $5) RETURNING id`,
    [rare, setId, destinationId, poiId, release],
  );
  const window = await one(
    tx,
    `INSERT INTO legendary_windows (key, form_id, place_line, rule, months, source_url, release_id)
     VALUES ($1, $2, 'Da Nang · Fireworks', '{"type":"annual_range","start":"06-01","end":"06-02"}',
       '{6}', 'https://example.org', $3) RETURNING id`,
    [`dn-fireworks-${tag}`, legendary, release],
  );
  const guide = await one(
    tx,
    "INSERT INTO guides (slug, name, colour) VALUES ($1, 'Chava', 'green') RETURNING id",
    [`chava-${tag}`],
  );
  return { destinationId, poiId, starter, rare, rule, window, guide };
}

export async function buildCritterFixture(harness: CommandDoorsHarness): Promise<CritterFixture> {
  const [maya, rin, dropout] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  return withSystem(harness.pool, async (tx) => {
    const content = await seedCritterContent(tx, maya.uid);
    const crewId = await one(
      tx,
      "INSERT INTO crews (name, created_by) VALUES ('Crit', $1) RETURNING id",
      [maya.uid],
    );
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [crewId, maya.uid, rin.uid, dropout.uid],
    );
    const tripId = await one(
      tx,
      "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
      [crewId, content.destinationId],
    );
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in'), ($1, $4, 'member', 'out')`,
      [tripId, maya.uid, rin.uid, dropout.uid],
    );
    await tx.query('UPDATE trips SET tz = $2, start_date = $3, end_date = $4 WHERE id = $1', [
      tripId,
      TRIP_TZ,
      localDate(TRIP_TZ, -1),
      localDate(TRIP_TZ, 2),
    ]);
    for (const status of TO_IN_TRIP) {
      await tx.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
    }
    return {
      maya,
      rin,
      dropout,
      tripId,
      poiId: content.poiId,
      starterFormId: content.starter,
      rareFormId: content.rare,
      ruleId: content.rule,
      windowId: content.window,
      guideId: content.guide,
    };
  });
}
