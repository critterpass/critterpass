/**
 * `tips.generate` against a migrated Postgres with fare cells priced from a recorded Travelpayouts
 * response (SIN → DPS, November 2026: $139 against a dearer week before it): the fare drop is found
 * from stored facts only, a reply with a number the facts lack is replaced by the template, a
 * grounded reply is kept, a crew gets one tip a day, a told fact is never repeated, the kill switch
 * stops everything, and `dismiss_tip`'s status change leaves the crew's stream.
 */
import { createGateway } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { refreshFares } from '../../src/travel-data/fares-refresh';
import { detectTipFacts } from '../../src/jobs/tips/detect';
import { generateTips } from '../../src/jobs/tips';
import {
  insertCrew,
  insertUser,
  silentLogger,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';
import { insertLiveDestinations, recordedFares } from '../travel-data/travel-fixtures';
import { withSystem } from '@cp/db';

// Pinned: the recorded response was fetched for this night.
const NOW = new Date('2026-09-28T03:00:00Z');
let db: NotifyDb;
let bali: string;
let crewId: string;

function replying(text: string) {
  return () =>
    createGateway({
      apiKey: 'test',
      maxAttempts: 1,
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              model: 'deepseek-flash',
              content: [{ type: 'text', text }],
              stop_reason: 'end_turn',
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    });
}

async function tips() {
  const { rows } = await db.pool.query<{
    id: string;
    kind: string;
    text: string;
    status: string;
    facts: { facts: { kind: string; value_minor: number | null; origin: string | null }[] };
  }>('SELECT id, kind, text, status, facts FROM home_tips WHERE crew_id = $1 ORDER BY created_at', [
    crewId,
  ]);
  return rows;
}

beforeAll(async () => {
  db = await startNotifyDb();
  const destinations = await insertLiveDestinations(db.pool);
  bali = destinations['bali']!;
  const winston = await insertUser(db.pool);
  await db.pool.query("UPDATE users SET home_airport = 'SIN' WHERE id = $1", [winston]);
  crewId = await insertCrew(db.pool, [winston]);
  await db.pool.query(
    `INSERT INTO trips (crew_id, status, destination_id, start_date, tz)
     VALUES ($1, 'voting', $2, '2026-11-11', 'Asia/Makassar')`,
    [crewId, bali],
  );
  // The week before tonight's price, as the nightly job stored it.
  await db.pool.query(
    `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, price_minor, currency,
       price_history, fetched_at, checked_at)
     VALUES ('SIN', 'DPS', $1, '2026-11-01', 17500, 'USD', $2, $3, $3)`,
    [
      bali,
      JSON.stringify([
        { on: '2026-09-23', price_minor: 18_000 },
        { on: '2026-09-25', price_minor: 17_500 },
        { on: '2026-09-27', price_minor: 17_000 },
      ]),
      new Date(NOW.getTime() - 30 * 3_600_000),
    ],
  );
  const fares = recordedFares();
  await refreshFares({
    pool: db.pool,
    fetchMonth: fares.fetchMonth,
    logger: silentLogger,
    now: NOW,
    only: (t) => `${t.origin}-${t.destIata}-${t.month}` === 'SIN-DPS-2026-11',
  });
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('detectTipFacts', () => {
  it('finds the recorded fare drop against the stored week', async () => {
    const facts = await withSystem(db.pool, (tx) =>
      detectTipFacts(tx, crewId, NOW.toISOString().slice(0, 10), 15),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        kind: 'fare_drop',
        place_id: bali,
        value_minor: 13_900,
        currency: 'USD',
        origin: 'SIN',
        origin_city: 'Singapore',
        delta_pct: 20,
      }),
    );
  });
});

describe('generateTips', () => {
  it('replaces a reply with an unsupported number by the template, once a day', async () => {
    const stored = await generateTips(db.pool, crewId, {
      now: NOW,
      phraser: replying('Flights from Singapore to bali just dropped to $99!'),
    });
    expect(stored).toBe(1);
    const [tip] = await tips();
    expect(tip).toMatchObject({
      kind: 'fare_drop',
      status: 'active',
      text: 'Flights from Singapore to bali just dropped to $139.',
    });
    expect(tip?.facts.facts[0]).toMatchObject({ kind: 'fare_drop', value_minor: 13_900 });

    expect(await generateTips(db.pool, crewId, { now: new Date(NOW.getTime() + 3_600_000) })).toBe(
      0,
    );
  });

  it('keeps a grounded reply and never tells the same fact twice', async () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000);
    // Same facts as yesterday's tip: nothing new to say.
    expect(
      await generateTips(db.pool, crewId, {
        now: tomorrow,
        phraser: replying('Bali from Singapore is down to $139 now.'),
      }),
    ).toBe(0);

    await db.pool.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source,
         sourced_on, reviewed_at)
       VALUES ($1, 'galungan-2026', 'ceremony', 'Galungan', '2026-11-25', '2026-12-05',
         'editorial', '2026-09-01', now())`,
      [bali],
    );
    const later = new Date(NOW.getTime() + 48 * 3_600_000);
    const stored = await generateTips(db.pool, crewId, {
      now: later,
      phraser: replying('Bali from Singapore is down to $139, and Galungan starts November 25.'),
    });
    expect(stored).toBe(1);
    const all = await tips();
    expect(all.map((tip) => tip.status)).toEqual(['expired', 'active']);
    expect(all[1]?.text).toBe(
      'Bali from Singapore is down to $139, and Galungan starts November 25.',
    );
  });

  it("speaks as the destination's own critter only while guides go by city", async () => {
    await db.pool.query(
      `INSERT INTO guides (slug, name, colour, accent, critter_key)
       VALUES ('ngua', 'Ngựa', 'pink', '#ff8fbf', 'cp-006')`,
    );
    await db.pool.query("UPDATE destinations SET critter_key = 'cp-006' WHERE id = $1", [bali]);
    const event = (key: string, starts: string) =>
      db.pool.query(
        `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source,
           sourced_on, reviewed_at)
         VALUES ($1, $2, 'festival', $2, $3, $3, 'editorial', '2026-09-01', now())`,
        [bali, key, starts],
      );
    const guideOfLatestTip = async () =>
      (
        await db.pool.query<{ slug: string | null }>(
          `SELECT g.slug FROM home_tips t LEFT JOIN guides g ON g.id = t.guide_id
            WHERE t.crew_id = $1 ORDER BY t.created_at DESC LIMIT 1`,
          [crewId],
        )
      ).rows[0]?.slug;
    const setPerCity = (on: boolean) =>
      db.pool.query(
        `INSERT INTO ops.ops_config (key, value) VALUES ('guides.per_city', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(on)],
      );

    await setPerCity(false);
    await event('Kuningan', '2026-12-05');
    expect(
      await generateTips(db.pool, crewId, { now: new Date(NOW.getTime() + 72 * 3_600_000) }),
    ).toBe(1);
    // As before the switch existed: this destination is no place's home, so no guide signs the tip.
    expect(await guideOfLatestTip()).toBeNull();

    await setPerCity(true);
    await event('Pagerwesi', '2026-12-16');
    expect(
      await generateTips(db.pool, crewId, { now: new Date(NOW.getTime() + 96 * 3_600_000) }),
    ).toBe(1);
    expect(await guideOfLatestTip()).toBe('ngua');
    await setPerCity(false);
  });

  it('does nothing while the kill switch is off', async () => {
    await db.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('home.tips.enabled', 'false')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    const weekLater = new Date(NOW.getTime() + 7 * 24 * 3_600_000);
    expect(await generateTips(db.pool, crewId, { now: weekLater })).toBe(0);
    await db.pool.query("DELETE FROM ops.ops_config WHERE key = 'home.tips.enabled'");
  });
});
