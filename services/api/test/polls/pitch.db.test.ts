/**
 * `POST /v1/pitches` over the real stack with a recorded DeepSeek stream: the sticker and the
 * tool chips arrive first, then the validated sections (reasons carry the members whose taste tag
 * they match), then `done`; a second request replays the cached pitch fast without the model; a
 * fare change pitches afresh; no model = the numbers-free template; outsiders see nothing.
 */
import { createGateway } from '@cp/ai';
import { fixtureTransport, type FixtureTransport } from '@cp/ai/testing';
import { pitchSectionsSchema, type PitchStreamEvent } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { storePitchTranslation } from '../../src/routes/pitch-reader-language';
import { registerPitchRoutes } from '../../src/routes/pitches';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import { buildPollCrew, insertPlace, startPollDoors, type PollCrew } from './poll-fixture';

const NOW = new Date('2027-03-20T02:00:00Z');

let harness: CommandDoorsHarness;
let crew: PollCrew;
let kyoto: string;
let deepseek: FixtureTransport = fixtureTransport([]);
let useModel = true;

beforeAll(async () => {
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: (...args) => deepseek.fetch(...args),
    maxAttempts: 1,
  });
  harness = await startPollDoors(undefined, (app, deps) => {
    registerPitchRoutes(app, {
      ...deps,
      get gateway() {
        return useModel ? gateway : undefined;
      },
      now: () => NOW,
    });
  });
  crew = await buildPollCrew(harness, 6);
  kyoto = await insertPlace(harness, 'Kyoto', 'kyoto', 'live');
  const q = (sql: string, params: unknown[]) => harness.pool.query(sql, params);
  await q("UPDATE crews SET name = 'The Bali Six' WHERE id = $1", [crew.crewId]);
  for (const [i, member] of crew.members.entries()) {
    await q(
      'INSERT INTO taste_profiles (user_id, tags) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET tags = EXCLUDED.tags',
      [member.uid, i < 4 ? ['FOODIE'] : ['TEMPLES']],
    );
  }
  for (const [origin, price, minutes] of [
    ['SIN', 41_200, 415],
    ['SGN', 38_900, 360],
  ] as const) {
    await q(
      `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, depart_on, return_on,
         price_minor, currency, transfers, duration_min, fetched_at, checked_at)
       VALUES ($1, 'KIX', $2, '2027-04-01', '2027-04-02', '2027-04-09', $3, 'USD', 0, $4, $5, $5)`,
      [origin, kyoto, price, minutes, NOW],
    );
  }
  await q(
    `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source, sourced_on)
     VALUES ($1, 'blossoms', 'blossom', 'Cherry blossoms', '2027-04-03', '2027-04-10', 'editorial', '2026-09-01')`,
    [kyoto],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function pitch(who: SignedIn, body: Record<string, unknown>) {
  const response = await harness.request('/v1/pitches', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(body),
  });
  if (response.status !== 200) return { status: response.status, events: [] as PitchStreamEvent[] };
  const text = await response.text();
  const events = text.split('\n\n').flatMap((block) => {
    const type = /^event: (.*)$/mu.exec(block)?.[1];
    const data = /^data: (.*)$/mu.exec(block)?.[1];
    return type === undefined || data === undefined
      ? []
      : [{ type, ...(JSON.parse(data) as object) } as PitchStreamEvent];
  });
  return { status: response.status, events };
}

describe('POST /v1/pitches', () => {
  it('streams sticker and chips first, then the grounded sections, then done', async () => {
    deepseek = fixtureTransport(['pitch-01']);
    const { status, events } = await pitch(crew.members[1]!, {
      crew_id: crew.crewId,
      place_id: kyoto,
      month: 4,
    });
    expect(status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      'sticker',
      'chip',
      'chip',
      'chip',
      'headline',
      'reason',
      'reason',
      'reason',
      'quote',
      'done',
    ]);
    expect(events[1]).toEqual({
      type: 'chip',
      kind: 'price',
      amount_minor: 41_200,
      currency: 'USD',
      origin: 'SIN',
    });
    const foodie = events.find((event) => event.type === 'reason' && event.tag === 'FOODIE');
    expect(foodie && 'member_ids' in foodie ? foodie.member_ids : []).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({ type: 'done', cached: false, ai_generated: true });
    const request = JSON.stringify(deepseek.requests[0]);
    expect(request).toContain('$412');
    expect(request).not.toMatch(/budget/iu);
  });

  it('replays the cached pitch fast and without the model', async () => {
    deepseek = fixtureTransport([]);
    const started = performance.now();
    const { events } = await pitch(crew.members[2]!, {
      crew_id: crew.crewId,
      place_id: kyoto,
      month: 4,
    });
    expect(performance.now() - started).toBeLessThan(300);
    expect(events.at(-1)).toMatchObject({ type: 'done', cached: true });
    expect(events.filter((event) => event.type === 'reason')).toHaveLength(3);
    expect(deepseek.requests).toHaveLength(0);
  });

  it('replays the pitch in the asker’s language once its translation is stored', async () => {
    deepseek = fixtureTransport([]);
    const reader = crew.members[4]!;
    await harness.pool.query("UPDATE users SET locale = 'vi' WHERE id = $1", [reader.uid]);
    const { rows } = await harness.pool.query<{ id: string; sections: unknown }>(
      'SELECT id, sections FROM pitches WHERE crew_id = $1 ORDER BY created_at DESC LIMIT 1',
      [crew.crewId],
    );
    const sections = pitchSectionsSchema.parse(rows[0]?.sections);
    const client = await harness.pool.connect();
    try {
      await storePitchTranslation(client, rows[0]!.id, sections, 'vi', {
        headline: 'Kyoto mùa hoa anh đào',
        reason_0: 'Lý do một',
        reason_1: 'Lý do hai',
        reason_2: 'Lý do ba',
        quote: 'Đi thôi.',
      });
    } finally {
      client.release();
    }
    const body = { crew_id: crew.crewId, place_id: kyoto, month: 4 };
    const vi = await pitch(reader, body);
    expect(vi.events.find((event) => event.type === 'headline')).toEqual({
      type: 'headline',
      text: 'Kyoto mùa hoa anh đào',
    });
    expect(vi.events.flatMap((event) => (event.type === 'reason' ? [event.text] : []))).toEqual([
      'Lý do một',
      'Lý do hai',
      'Lý do ba',
    ]);
    // An English reader of the same cached pitch still reads it as written.
    const en = await pitch(crew.members[2]!, body);
    expect(en.events.find((event) => event.type === 'headline')).toEqual({
      type: 'headline',
      text: sections.headline,
    });
    expect(deepseek.requests).toHaveLength(0);
    // Back to a crew that all reads English, as the other cases assume.
    await harness.pool.query('UPDATE users SET locale = NULL WHERE id = $1', [reader.uid]);
  });

  it('pitches afresh once a quoted fare moves, and from the template without a model', async () => {
    await harness.pool.query(
      "UPDATE fare_cells SET price_minor = 39900 WHERE destination_id = $1 AND origin_iata = 'SIN'",
      [kyoto],
    );
    useModel = false;
    const { events } = await pitch(crew.members[3]!, {
      crew_id: crew.crewId,
      place_id: kyoto,
      month: 4,
    });
    useModel = true;
    expect(events.find((event) => event.type === 'headline')).toEqual({
      type: 'headline',
      text: 'Kyoto, for The Bali Six',
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', cached: false, ai_generated: false });
    expect(events.find((event) => event.type === 'chip')).toMatchObject({ amount_minor: 39_900 });
  });

  it('shows nothing to an outsider and refuses an unknown place', async () => {
    const outsider = await harness.signInAnonymously();
    expect((await pitch(outsider, { crew_id: crew.crewId, place_id: kyoto })).status).toBe(404);
    expect(
      (await pitch(crew.organiser, { crew_id: crew.crewId, place_id: crew.crewId })).status,
    ).toBe(404);
  });
});
