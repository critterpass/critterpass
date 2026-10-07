/**
 * The guide's words on a disruption and a forecast watch row in each reader's language: the
 * `guide_text.translate` sweep picks them up with the rest of the trip's guide text (the model's
 * answer is a live DeepSeek recording replayed at the network boundary), and the flight and watch
 * pushes read the recipient's translation. An English reader keeps the source words.
 */
import { randomUUID } from 'node:crypto';

import { fixtureTransport } from '@cp/ai/testing';
import { withSystem } from '@cp/db';
import { guideText } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDisruptionNotifications } from '../../src/jobs/disruptions/notify';
import { registerWatchNotifications } from '../../src/jobs/disruptions/watch-notify';
import { translateGuideText } from '../../src/jobs/i18n';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { testRuntime } from '../guide/guide-fixtures';
import {
  insertCrew,
  insertTripUnderWay,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

const FLIGHT = {
  title: 'VN 123 lands at 19:30',
  summary: 'Two of you land at 19:30. I moved the surf lesson and need a yes on dinner.',
};
const BOAT = {
  title: 'Cham Island boat · waves 2.5 m',
  detail: 'Forecast shows waves 2.5 m, wind 35 km/h. The harbour might close.',
};

let db: NotifyDb;
let organiser: string;
let linh: string;
let tripId: string;
let crewId: string;
let disruptionId: string;
let watchId: string;

beforeAll(async () => {
  db = await startNotifyDb();
  organiser = await insertUser(db.pool);
  linh = await insertUser(db.pool);
  crewId = await insertCrew(db.pool, [organiser, linh]);
  tripId = await insertTripUnderWay(db.pool, crewId, 'Asia/Ho_Chi_Minh', [organiser, linh]);
  await db.pool.query(
    "UPDATE trips SET guide_id = (SELECT id FROM guides WHERE slug = 'chava') WHERE id = $1",
    [tripId],
  );
  await db.pool.query("INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')", [linh]);
  const disruption = await db.pool.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, title, summary, affected)
     VALUES ($1, 'flight_delay', 'delay', 'flight:vn123', $2, $3, $4) RETURNING id`,
    [
      tripId,
      FLIGHT.title,
      FLIGHT.summary,
      JSON.stringify({ traveller_ids: [organiser, linh], item_stable_ids: [], unaffected_ids: [] }),
    ],
  );
  disruptionId = disruption.rows[0]?.id as string;
  const watch = await db.pool.query<{ id: string }>(
    `INSERT INTO watch_items (trip_id, kind, target_ref, day, status, title, detail)
     VALUES ($1, 'marine', 'day:boat', current_date + 1, 'plan_b', $2, $3) RETURNING id`,
    [tripId, BOAT.title, BOAT.detail],
  );
  watchId = watch.rows[0]?.id as string;
  registerDisruptionNotifications();
  registerWatchNotifications();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function stored(table: 'disruptions' | 'watch_items', id: string) {
  const { rows } = await db.pool.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = $1`,
    [id],
  );
  return rows[0] as Record<string, string | null> & { i18n: unknown };
}

const routed = (type: string, payload: Record<string, unknown>): RoutedEvent => ({
  id: randomUUID(),
  type,
  payload: { trip_id: tripId, ...payload },
  crewId,
  tripId,
  actorId: null,
  occurredAt: new Date(),
});

describe('disruption and watch words in the reader language', () => {
  it('translates both rows in the trip sweep, numbers intact', async () => {
    const transport = fixtureTransport(['guide-text-translate-vi-disruptions']);
    const outcome = await translateGuideText(testRuntime(db.pool, transport), { trip_id: tripId });
    expect(outcome).toMatchObject({ outcome: 'translated', calls: 1, stored: { vi: 4 } });
    const request = JSON.stringify(transport.requests[0]);
    for (const line of [FLIGHT.title, FLIGHT.summary, BOAT.title, BOAT.detail]) {
      expect(request).toContain(line.slice(0, 20));
    }
    const flight = await stored('disruptions', disruptionId);
    const read = (field: 'title' | 'summary', locale: string) =>
      guideText('disruption', FLIGHT, flight.i18n, field, locale);
    expect(read('title', 'vi')).toBe('VN 123 hạ cánh lúc 19:30');
    expect(read('summary', 'en')).toBe(FLIGHT.summary);
    const boat = await stored('watch_items', watchId);
    expect(guideText('watch_item', BOAT, boat.i18n, 'detail', 'vi')).toBe(
      'Dự báo sóng 2.5 m, gió 35 km/h. Cảng có thể đóng.',
    );
  });

  it('asks for nothing on the next sweep', async () => {
    const transport = fixtureTransport([]);
    const outcome = await translateGuideText(testRuntime(db.pool, transport), { trip_id: tripId });
    expect(outcome).toMatchObject({ outcome: 'nothing_missing', calls: 0 });
  });

  it('pushes each recipient the words in their own language', async () => {
    const watch = getRegistration('watch.escalated', 'watch_escalation');
    const flight = getRegistration('disruption.detected', 'disruption_update');
    if (watch === undefined || flight === undefined) throw new Error('not registered');
    await withSystem(db.pool, async (tx) => {
      const escalated = routed('watch.escalated', {
        watch_item_id: watchId,
        status: 'plan_b',
        plan_changing: true,
      });
      expect((await watch.compose(tx, escalated, linh))?.vars).toEqual({
        title: 'Tàu Cù Lao Chàm · sóng 2.5 m',
        detail: 'Dự báo sóng 2.5 m, gió 35 km/h. Cảng có thể đóng.',
      });
      expect((await watch.compose(tx, escalated, organiser))?.vars).toEqual(BOAT);
      const detected = routed('disruption.detected', { disruption_id: disruptionId, done: 2 });
      expect((await flight.compose(tx, detected, linh))?.vars).toEqual({
        headline: 'VN 123 hạ cánh lúc 19:30',
        detail: 'Hai bạn hạ cánh lúc 19:30. Mình đã dời buổi học lướt và cần bạn xác nhận bữa tối.',
      });
      expect((await flight.compose(tx, detected, organiser))?.vars).toEqual({
        headline: FLIGHT.title,
        detail: FLIGHT.summary,
      });
    });
  });

  it('reads the source words once the guide rewrote the line', async () => {
    await db.pool.query("UPDATE watch_items SET detail = 'Calm again by Saturday.' WHERE id = $1", [
      watchId,
    ]);
    const boat = await stored('watch_items', watchId);
    const source = { title: BOAT.title, detail: 'Calm again by Saturday.' };
    expect(guideText('watch_item', source, boat.i18n, 'detail', 'vi')).toBe(
      'Calm again by Saturday.',
    );
  });
});

describe('a row needing a yes', () => {
  it('pushes its deciders the disruption and the row to approve, beside the poll', async () => {
    const pollId = randomUUID();
    await db.pool.query('UPDATE disruptions SET actions = $2 WHERE id = $1', [
      disruptionId,
      JSON.stringify([
        {
          id: 'retime:dinner',
          poll: { id: pollId, approve_option_id: randomUUID(), keep_option_id: randomUUID() },
          affected_user_ids: [organiser],
          label: 'Move dinner to 20:30',
        },
      ]),
    ]);
    const needsYes = getRegistration('disruption.needs_yes', 'disruption_update');
    if (needsYes === undefined) throw new Error('not registered');
    await withSystem(db.pool, async (tx) => {
      const asked = routed('disruption.needs_yes', {
        disruption_id: disruptionId,
        action_id: pollId,
        affected: 1,
      });
      expect(await needsYes.audience(tx, asked)).toEqual([organiser]);
      const push = await needsYes.compose(tx, asked, organiser);
      expect(push?.vars).toMatchObject({ line: 'Move dinner to 20:30' });
      expect(push?.ctx).toEqual({
        poll_id: pollId,
        disruption_id: disruptionId,
        action_id: 'retime:dinner',
      });
    });
  });
});
