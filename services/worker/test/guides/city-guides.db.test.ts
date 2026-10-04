/**
 * City critter guides against a migrated Postgres: the database folds a critter's name to the
 * same slug as the dex does; a released critter gets its guide row and keeps an earlier row's slug
 * and colour; a destination carries its city's critter; a trip's guide follows its destination's
 * critter only while the switch is on; and the re-point run moves only trips that have not started.
 */
import { randomUUID } from 'node:crypto';

import { GUIDE_FACTS, guideAccent } from '@cp/critter-art/guides';
import { GUIDES_PER_CITY_KEY, syncCritterGuides, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { critterGuideLook } from '../../src/guides/look';
import { repointGuides } from '../../src/guides/repoint';
import { closePollAtDeadline } from '../../src/jobs/polls';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-20T08:00:00Z');
const PAST = new Date('2026-10-20T07:00:00Z');

let harness: JobsHarness;
let organiser: string;
let crewId: string;
let daLat: string;
let daNang: string;
let nowhere: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const [row] = await q<T>(sql, params);
  if (row === undefined) throw new Error(`no row: ${sql}`);
  return row;
}

const setSwitch = (on: boolean) =>
  q(
    `INSERT INTO ops.ops_config (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [GUIDES_PER_CITY_KEY, JSON.stringify(on)],
  );

const guideOf = async (destinationId: string) =>
  (
    await one<{ slug: string | null }>(
      'SELECT (SELECT slug FROM guides WHERE id = app.destination_guide_id($1)) AS slug',
      [destinationId],
    )
  ).slug;

const tripGuide = async (tripId: string) =>
  (
    await one<{ slug: string | null }>(
      'SELECT g.slug FROM trips t LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
      [tripId],
    )
  ).slug;

const STATUS_PATH = [
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
];

/** A trip to the destination, walked through the real status transitions up to `status`. */
async function tripTo(destinationId: string, status: string, guide: string): Promise<string> {
  const { id } = await one<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, guide_id)
     VALUES ($1, 'setup', $2, (SELECT id FROM guides WHERE slug = $3)) RETURNING id`,
    [crewId, destinationId, guide],
  );
  for (const next of STATUS_PATH.slice(1, STATUS_PATH.indexOf(status) + 1)) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [id, next]);
  }
  return id;
}

/** A voting trip whose final has one place left, one ballot on it and a deadline that passed. */
async function voteFor(destinationId: string): Promise<{ pollId: string; tripId: string }> {
  await q("UPDATE polls SET status = 'cancelled' WHERE crew_id = $1 AND status = 'open'", [crewId]);
  const { id: tripId } = await one<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  const { id: pollId } = await one<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, stage, created_by, eligible_voter_ids, closes_at, tie_rule)
     VALUES ($1, $2, 'destination', 'final', $3, ARRAY[$3]::uuid[], $4, 'cheaper_for_majority_origin')
     RETURNING id`,
    [crewId, tripId, organiser, PAST],
  );
  const { id: pitch } = await one<{ id: string }>(
    `INSERT INTO pitches (crew_id, trip_id, destination_id, cache_key, status)
     VALUES ($1, $2, $3, 'k', 'final') RETURNING id`,
    [crewId, tripId, destinationId],
  );
  const { id: option } = await one<{ id: string }>(
    `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, pitch_id, position)
     VALUES ($1, $2, 'destination', $3, 'Place', $4, 0) RETURNING id`,
    [pollId, crewId, destinationId, pitch],
  );
  await q(
    `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, op_id, cast_at)
     VALUES ($1, $2, $3, $4, gen_random_uuid(), $5)`,
    [pollId, option, crewId, organiser, PAST],
  );
  return { pollId, tripId };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  organiser = randomUUID();
  await q(
    "INSERT INTO users (id, status, home_airport, display_name) VALUES ($1, 'registered', 'SGN', 'Linh Tran')",
    [organiser],
  );
  ({ id: crewId } = await one<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Guide crew', $1) RETURNING id",
    [organiser],
  ));
  await q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')", [
    crewId,
    organiser,
  ]);
  // Chà Vá's row ships with the schema; Tokek's is the row every environment already has.
  await q("INSERT INTO guides (slug, name, colour) VALUES ('tokek', 'Tokek', 'yellow')");
  ({ id: daNang } = await one<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh')
     RETURNING id`,
  ));
  ({ id: nowhere } = await one<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('nowhere', 'Nowhere', 'guest') RETURNING id",
  ));
  const { id: release } = await one<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at)
     VALUES ('critters', 1, 'critters-1', 'critters-1', 'published', 'review', repeat('a', 64), '{}', 2,
       $1, now()) RETURNING id`,
    [organiser],
  );
  const { id: vietnam } = await one<{ id: string }>(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       guide_slug, destination_id, hero_critter_key, month_hints, release_id)
     VALUES ('vn', 'Vietnam', 'VN', 0, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'chava', $1,
       'cp-151', '[]', $2) RETURNING id`,
    [daNang, release],
  );
  for (const key of ['cp-006', 'cp-151']) {
    const facts = GUIDE_FACTS.find((entry) => entry.key === key)!;
    const artParams = facts.colours === null ? { k: 'langur' } : { b: 'stand', c: facts.colours };
    const { id } = await one<{ id: string }>(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, $4, $5, $6, 7, 'note', $7) RETURNING id`,
      [key, vietnam, Number(key.slice(3)), facts.city, facts.species, artParams, release],
    );
    await q(
      "INSERT INTO critter_names (critter_id, form_id, locale, name, release_id) VALUES ($1, NULL, 'en', $2, $3)",
      [id, facts.name, release],
    );
  }
  ({ id: daLat } = await one<{ id: string }>(
    "SELECT id FROM destinations WHERE slug = 'vn-da-lat'",
  ));
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('guide slugs', () => {
  it('fold the same way in the database as in the dex, for every critter', async () => {
    const names = GUIDE_FACTS.map((facts) => facts.name);
    const rows = await q<{ name: string; slug: string }>(
      'SELECT name, app.guide_slug(name) AS slug FROM unnest($1::text[]) AS name',
      [names],
    );
    expect(Object.fromEntries(rows.map((row) => [row.name, row.slug]))).toEqual(
      Object.fromEntries(GUIDE_FACTS.map((facts) => [facts.name, facts.slug])),
    );
  });
});

describe('guide rows from released critters', () => {
  it('creates a guide per critter and keeps an earlier guide row as it was', async () => {
    const written = await withSystem(harness.pool, (tx) => syncCritterGuides(tx, critterGuideLook));
    expect(written).toBeGreaterThan(0);
    const rows = await q(
      `SELECT slug, name, colour, accent, critter_key FROM guides
        WHERE critter_key IS NOT NULL ORDER BY critter_key`,
    );
    expect(rows).toEqual([
      { slug: 'ngua', name: 'Ngựa', colour: 'cream', accent: '#fff1d6', critter_key: 'cp-006' },
      {
        slug: 'chava',
        name: 'Chà Vá',
        colour: 'red',
        accent: guideAccent('chava', null),
        critter_key: 'cp-151',
      },
    ]);
    expect(await q("SELECT 1 FROM guides WHERE slug = 'chava'")).toHaveLength(1);
    expect(await withSystem(harness.pool, (tx) => syncCritterGuides(tx, critterGuideLook))).toBe(0);
  });

  it('refuses two critters that fold to one slug', async () => {
    await expect(
      withSystem(harness.pool, async (tx) => {
        await tx.query(
          `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
           SELECT 'cp-900', set_id, 900, 'Twin', 'Twin', art_params, 7, 'note', release_id
             FROM critters WHERE key = 'cp-006'`,
        );
        await tx.query(
          `INSERT INTO critter_names (critter_id, form_id, locale, name, release_id)
           SELECT c.id, NULL, 'en', 'Ngua', c.release_id FROM critters c WHERE c.key = 'cp-900'`,
        );
        await syncCritterGuides(tx, critterGuideLook);
      }),
    ).rejects.toThrow(/guides_slug_key/);
    expect(await q("SELECT 1 FROM guides WHERE critter_key = 'cp-900'")).toHaveLength(0);
  });

  it('ties a city destination to its critter and a place destination to its hero', async () => {
    const rows = await q<{ slug: string; critter_key: string | null }>(
      'SELECT slug, critter_key FROM destinations ORDER BY slug',
    );
    expect(rows).toEqual([
      { slug: 'da-nang', critter_key: 'cp-151' },
      { slug: 'nowhere', critter_key: null },
      { slug: 'vn-da-lat', critter_key: 'cp-006' },
    ]);
  });
});

describe("a trip's guide", () => {
  it("is the place's guide, else Tokek, while the switch is off", async () => {
    await setSwitch(false);
    expect(await guideOf(daLat)).toBe('chava');
    expect(await guideOf(daNang)).toBe('chava');
    expect(await guideOf(nowhere)).toBe('tokek');
    const vote = await voteFor(daLat);
    expect(await closePollAtDeadline(harness.pool, vote.pollId, NOW)).toBe('closed');
    expect(await tripGuide(vote.tripId)).toBe('chava');
  });

  it("is the destination's critter once the switch is on", async () => {
    await setSwitch(true);
    expect(await guideOf(daLat)).toBe('ngua');
    expect(await guideOf(daNang)).toBe('chava');
    expect(await guideOf(nowhere)).toBe('tokek');
    const vote = await voteFor(daLat);
    expect(await closePollAtDeadline(harness.pool, vote.pollId, NOW)).toBe('closed');
    expect(await tripGuide(vote.tripId)).toBe('ngua');
    const { is_guest_guide: guest } = await one<{ is_guest_guide: boolean }>(
      'SELECT is_guest_guide FROM trips WHERE id = $1',
      [vote.tripId],
    );
    expect(guest).toBe(false);
  });
});

describe('re-pointing trips that have not started', () => {
  it('moves planning and pre-trip trips and leaves trips under way or over', async () => {
    await q('UPDATE trips SET guide_id = (SELECT id FROM guides WHERE slug = $1)', ['chava']);
    const planning = await tripTo(daLat, 'setup', 'chava');
    const pre = await tripTo(daLat, 'pre_trip', 'chava');
    const under = await tripTo(daLat, 'in_trip', 'chava');
    const over = await tripTo(daLat, 'post_trip', 'chava');
    const home = await tripTo(daNang, 'setup', 'chava');
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);

    await setSwitch(false);
    expect(await repointGuides(harness.pool, { log })).toEqual({ perCity: false, moved: 0 });
    expect(await tripGuide(planning)).toBe('chava');

    await setSwitch(true);
    const dry = await repointGuides(harness.pool, { dryRun: true, log });
    expect(await tripGuide(planning)).toBe('chava');
    const run = await repointGuides(harness.pool, { log });
    // The two trips above and the two the votes won; Đà Nẵng's is already on its own guide.
    expect(dry).toEqual({ perCity: true, moved: 4 });
    expect(run).toEqual(dry);
    expect(await tripGuide(planning)).toBe('ngua');
    expect(await tripGuide(pre)).toBe('ngua');
    expect(await tripGuide(under)).toBe('chava');
    expect(await tripGuide(over)).toBe('chava');
    expect(await tripGuide(home)).toBe('chava');
    expect(await repointGuides(harness.pool, { log })).toEqual({ perCity: true, moved: 0 });
    expect(lines.join('\n')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});
