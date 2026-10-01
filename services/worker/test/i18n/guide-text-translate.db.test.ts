/**
 * `guide_text.translate` on a Đà Nẵng trip: an English-reading organiser, and Linh, whose app
 * turns Vietnamese. The model's answer is a live DeepSeek recording replayed at the network
 * boundary; everything else is the real job on a migrated Postgres.
 *
 * Proves, in order: nobody reading another language means no model call; the route's switch off
 * means source text only; one sweep translates the organiser's draft, Linh's briefing and the
 * day's quest into Vietnamese with every number intact and nothing a person typed touched; a
 * second sweep asks for nothing; the organiser-only draft's translations stay organiser-only; and
 * a guide action that copies the plan (`app.apply_change_set`) keeps the Vietnamese with each row,
 * except the note it rewrote, which reads as written for everyone and is not asked for again.
 */
import { randomUUID } from 'node:crypto';

import { numberTokens, resolveRoute } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { createKillSwitchReader, withUser } from '@cp/db';
import { guideText, guideTextSourceHash } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { translateGuideText } from '../../src/jobs/i18n';
import { testRuntime } from '../guide/guide-fixtures';
import { insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

const THEMES = ['Beach day, slow start', 'Up Ba Na Hills, early'] as const;
const NOTES = [
  'Ease in with a swim at My Khe before the sun gets sharp.',
  'Mì Quảng at Ba Mua: order the one with shrimp and pork.',
  'Dragon Bridge breathes fire at 21:00 on weekends, so be on the east bank by 20:45.',
  'Cable car up Ba Na Hills. Tickets are 900,000 VND each, so bring your booking code.',
] as const;
const TYPED = 'Coffee with my cousin at 15:00, I will catch up after.';
const BRIEFING = 'Leave by 7:10 for the Ba Na Hills cable car.';
const QUEST = {
  title: 'Bridge watchers',
  body: 'Get everyone to Dragon Bridge before the 21:00 fire show.',
} as const;
const HOUR = 60 * 60 * 1000;

let db: NotifyDb;
let organiser: string;
let linh: string;
let tripId: string;
let draft: string;
const stable: string[] = [];

async function id(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(sql, values);
  const row = rows[0];
  if (row === undefined) throw new Error(`no row from: ${sql}`);
  return row.id;
}

beforeAll(async () => {
  db = await startNotifyDb();
  organiser = await insertUser(db.pool);
  linh = await insertUser(db.pool);
  const crewId = await id(
    "INSERT INTO crews (name, created_by) VALUES ('Đà Nẵng', $1) RETURNING id",
    [organiser],
  );
  tripId = await id(
    `INSERT INTO trips (crew_id, status, tz, guide_id)
     SELECT $1, 'setup', 'Asia/Ho_Chi_Minh', g.id FROM guides g WHERE g.slug = 'chava' RETURNING id`,
    [crewId],
  );
  for (const [uid, role] of [
    [organiser, 'organiser'],
    [linh, 'member'],
  ] as const) {
    await db.pool.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      role,
    ]);
    await db.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, role],
    );
  }
  draft = await id(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'draft') RETURNING id",
    [tripId],
  );
  await db.pool.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, draft]);
  const days: string[] = [];
  for (const [index, theme] of THEMES.entries()) {
    days.push(
      await id(
        'INSERT INTO plan_days (version_id, trip_id, day_no, theme) VALUES ($1, $2, $3, $4) RETURNING id',
        [draft, tripId, index + 1, theme],
      ),
    );
  }
  const start = Date.now() + 24 * HOUR;
  const item = async (day: number, offset: number, notes: string, by: 'guide' | 'user') => {
    const stableId = randomUUID();
    await db.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, tz, category, notes,
         created_by_kind)
       VALUES ($1, $2, $3, $4, $5, 'Asia/Ho_Chi_Minh', 'activity', $6, $7)`,
      [draft, days[day], tripId, stableId, new Date(start + offset * HOUR), notes, by],
    );
    return stableId;
  };
  stable.push(await item(0, 0, NOTES[0], 'guide'));
  stable.push(await item(0, 3, NOTES[1], 'guide'));
  stable.push(await item(0, 12, NOTES[2], 'guide'));
  stable.push(await item(1, 24, NOTES[3], 'guide'));
  await item(0, 6, TYPED, 'user');
  for (const [uid, text] of [
    [linh, BRIEFING],
    [organiser, 'You owe 250,000 VND to the crew.'],
  ] as const) {
    const briefing = await id(
      `INSERT INTO briefings (trip_id, user_id, local_date, tz, built_at)
       VALUES ($1, $2, current_date, 'Asia/Ho_Chi_Minh', now()) RETURNING id`,
      [tripId, uid],
    );
    await db.pool.query(
      `INSERT INTO briefing_items (briefing_id, trip_id, user_id, icon, text, action, dedupe_key)
       VALUES ($1, $2, $3, 'sun', $4, 'open', 'line')`,
      [briefing, tripId, uid, text],
    );
  }
  await db.pool.query(
    `INSERT INTO quests (trip_id, local_date, slot, template, metric, target, reward, title, body,
       source, starts_at, ends_at)
     VALUES ($1, current_date, 0, 'crew_together', 'count', 1, '{"xp": 50}', $2, $3, 'guide', now(),
       now() + interval '1 day')`,
    [tripId, QUEST.title, QUEST.body],
  );
}, 240_000);

afterAll(async () => {
  await db.stop();
});

interface Stored {
  readonly i18n: Record<string, Record<string, string | null> | string> | null;
}

async function itemOf(versionId: string, stableId: string) {
  const { rows } = await db.pool.query<Stored & { notes: string }>(
    'SELECT notes, i18n FROM plan_items WHERE version_id = $1 AND stable_id = $2',
    [versionId, stableId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('no such item');
  return row;
}

/** How a Vietnamese and an English reader read one item's note. */
async function read(versionId: string, stableId: string) {
  const row = await itemOf(versionId, stableId);
  return {
    vi: guideText('plan_item', { notes: row.notes }, row.i18n, 'notes', 'vi'),
    en: guideText('plan_item', { notes: row.notes }, row.i18n, 'notes', 'en'),
  };
}

async function translatedRows(): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM plan_days WHERE i18n IS NOT NULL)
          + (SELECT count(*) FROM plan_items WHERE i18n IS NOT NULL)
          + (SELECT count(*) FROM briefing_items WHERE i18n IS NOT NULL)
          + (SELECT count(*) FROM quests WHERE i18n IS NOT NULL) AS n`,
  );
  return Number(rows[0]?.n);
}

/** A runtime whose every model call must come out of `transport`: none left means none allowed. */
function runtimeOver(transport: FixtureTransport) {
  return testRuntime(db.pool, transport);
}

describe('guide_text.translate', () => {
  it('asks for nothing while everyone on the trip reads English', async () => {
    const transport = fixtureTransport([]);
    const outcome = await translateGuideText(runtimeOver(transport), { trip_id: tripId });
    expect(outcome).toMatchObject({ outcome: 'nothing_missing', calls: 0 });
    expect(transport.requests).toHaveLength(0);
    expect(await translatedRows()).toBe(0);
  });

  it('leaves everyone on the source text while the route is switched off', async () => {
    // Linh's app is in Vietnamese from here on (what `set_app_locale` stores).
    await db.pool.query(
      `INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')
       ON CONFLICT (user_id) DO UPDATE SET app_locale = 'vi'`,
      [linh],
    );
    await db.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('ai.guide_text.translate.enabled', 'false')`,
    );
    const transport = fixtureTransport([]);
    const switches = createKillSwitchReader(db.pool, { tierOf: (r) => resolveRoute(r).tier });
    const outcome = await translateGuideText(
      { ...runtimeOver(transport), assertRouteOn: switches.assertAiRoute },
      { trip_id: tripId },
    );
    expect(outcome).toMatchObject({ outcome: 'switched_off', calls: 0 });
    expect(transport.requests).toHaveLength(0);
    expect(await translatedRows()).toBe(0);
    await db.pool.query(`DELETE FROM ops.ops_config WHERE key = 'ai.guide_text.translate.enabled'`);
  });

  it("translates the existing plan, Linh's briefing and the quest once her language is known", async () => {
    const transport = fixtureTransport(['guide-text-translate-vi-danang']);
    const outcome = await translateGuideText(runtimeOver(transport), { trip_id: tripId });
    expect(outcome).toEqual({
      outcome: 'translated',
      calls: 1,
      stored: { vi: 9 },
      kept_source: {},
    });

    // One call, for Vietnamese, in Chà Vá's voice, carrying exactly the guide's own lines.
    expect(transport.requests).toHaveLength(1);
    const request = JSON.stringify(transport.requests[0]);
    expect(request).toContain('Chà Vá');
    expect(request).toContain('Reply language: Vietnamese (vi)');
    for (const line of [...THEMES, ...NOTES, BRIEFING, QUEST.title, QUEST.body]) {
      expect(request, line).toContain(line.slice(0, 30));
    }
    expect(request).not.toContain('my cousin');
    expect(request).not.toContain('250,000');

    expect(await read(draft, stable[2]!)).toEqual({
      vi: 'Dragon Bridge phun lửa lúc 21:00 cuối tuần, nên có mặt ở bờ đông trước 20:45.',
      en: NOTES[2],
    });
    // Every stored line keeps the numbers of the line it translates, digit for digit.
    for (const [index, stableId] of stable.entries()) {
      const { vi, en } = await read(draft, stableId);
      expect(en).toBe(NOTES[index]);
      expect(vi).not.toBe(en);
      expect(numberTokens(vi ?? '')).toEqual(numberTokens(NOTES[index]!));
    }
    const days = await db.pool.query<Stored & { theme: string }>(
      'SELECT theme, i18n FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [draft],
    );
    expect(
      days.rows.map((row) => guideText('plan_day', { theme: row.theme }, row.i18n, 'theme', 'vi')),
    ).toEqual(['Ngày biển, khởi động chậm thôi', 'Lên Ba Na Hills, sớm']);

    // What a person typed is never translated; the organiser's own briefing stays English.
    const typed = await db.pool.query<Stored>('SELECT i18n FROM plan_items WHERE notes = $1', [
      TYPED,
    ]);
    expect(typed.rows).toEqual([{ i18n: null }]);
    const briefings = await db.pool.query<Stored & { user_id: string; text: string }>(
      'SELECT user_id, text, i18n FROM briefing_items WHERE trip_id = $1',
      [tripId],
    );
    const mine = briefings.rows.find((row) => row.user_id === linh)!;
    expect(guideText('briefing_item', { text: mine.text }, mine.i18n, 'text', 'vi')).toBe(
      'Đi từ 7:10 để kịp cáp treo Ba Na Hills.',
    );
    expect(briefings.rows.find((row) => row.user_id === organiser)?.i18n).toBeNull();
    const quest = await db.pool.query<Stored & typeof QUEST>(
      'SELECT title, body, i18n FROM quests WHERE trip_id = $1',
      [tripId],
    );
    expect(quest.rows[0]?.i18n).toEqual({
      _src: guideTextSourceHash('quest', QUEST),
      vi: {
        title: 'Ngắm cầu',
        body: 'Đưa cả nhóm tới Dragon Bridge trước màn phun lửa lúc 21:00.',
      },
    });
  });

  it('finds nothing missing on the next sweep and makes no model call', async () => {
    const transport = fixtureTransport([]);
    const outcome = await translateGuideText(runtimeOver(transport), { trip_id: tripId });
    expect(outcome).toMatchObject({ outcome: 'nothing_missing', calls: 0 });
    expect(transport.requests).toHaveLength(0);
  });

  it("keeps an organiser-only draft's translations from a member", async () => {
    const sql = 'SELECT i18n FROM plan_items WHERE version_id = $1 AND i18n IS NOT NULL';
    const asUser = (uid: string) =>
      withUser(db.pool, uid, randomUUID(), async (tx) => (await tx.query(sql, [draft])).rowCount);
    expect(await asUser(organiser)).toBe(4);
    expect(await asUser(linh)).toBe(0);
    const themes = 'SELECT i18n FROM plan_days WHERE version_id = $1 AND i18n IS NOT NULL';
    expect(
      await withUser(
        db.pool,
        linh,
        randomUUID(),
        async (tx) => (await tx.query(themes, [draft])).rowCount,
      ),
    ).toBe(0);
  });

  it('carries the Vietnamese through a guide action, stale only where the action rewrote the text', async () => {
    // The draft is sent to the crew: it becomes the crew-visible current version.
    await db.pool.query(
      "UPDATE itinerary_versions SET visibility = 'crew', status = 'current' WHERE id = $1",
      [draft],
    );
    await db.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, draft]);

    // The guide moves the swim an hour later and rewrites the bridge note.
    const rewritten =
      'No fire show tonight: the bridge is closed, so meet at Son Tra night market.';
    const swim = await db.pool.query<{ starts_at: string }>(
      "SELECT to_jsonb(i) ->> 'starts_at' AS starts_at FROM plan_items i WHERE version_id = $1 AND stable_id = $2",
      [draft, stable[0]],
    );
    const later = new Date(Date.parse(swim.rows[0]!.starts_at) + HOUR).toISOString();
    const op = { affected_user_ids: [organiser, linh], booking_impact: false, reason: 'closure' };
    const ops = [
      { ...op, op: 'retime', target: stable[0], after: { starts_at: later } },
      { ...op, op: 'swap', target: stable[2], after: { notes: rewritten } },
    ];
    const guide = await id("SELECT id FROM guides WHERE slug = 'chava'", []);
    const changeSet = await id(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, author_kind, author_id, status, ops)
       VALUES ($1, $2, 'manual', 'guide', $3, 'draft', $4) RETURNING id`,
      [tripId, draft, guide, JSON.stringify(ops)],
    );
    await db.pool.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSet]);
    await db.pool.query(
      "UPDATE change_sets SET status = 'approved', approved_by_kind = 'policy' WHERE id = $1",
      [changeSet],
    );
    const next = await id('SELECT app.apply_change_set($1) AS id', [changeSet]);
    expect(next).not.toBe(draft);

    // Moved, same words: the Vietnamese came along. Untouched rows too, and the day themes.
    expect((await read(next, stable[0]!)).vi).toBe(
      'Khởi động nhẹ bằng một vòng bơi ở My Khe trước khi nắng gắt.',
    );
    expect((await read(next, stable[3]!)).vi).toContain('900,000 VND');
    const days = await db.pool.query<Stored & { theme: string }>(
      'SELECT theme, i18n FROM plan_days WHERE version_id = $1 ORDER BY day_no',
      [next],
    );
    const second = days.rows[1]!;
    expect(guideText('plan_day', { theme: second.theme }, second.i18n, 'theme', 'vi')).toBe(
      'Lên Ba Na Hills, sớm',
    );
    // Rewritten: the old Vietnamese no longer matches, so everyone reads the new words as written.
    expect(await read(next, stable[2]!)).toEqual({ vi: rewritten, en: rewritten });
    expect((await itemOf(next, stable[2]!)).i18n?.['vi']).toBeDefined();

    // The sweep leaves the rewritten note alone: no model call for it.
    const transport = fixtureTransport([]);
    const outcome = await translateGuideText(runtimeOver(transport), { trip_id: tripId });
    expect(outcome).toMatchObject({ outcome: 'nothing_missing', calls: 0 });
    expect(transport.requests).toHaveLength(0);
    expect(await read(next, stable[2]!)).toEqual({ vi: rewritten, en: rewritten });
  });
});
