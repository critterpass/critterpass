/**
 * Recap narration against the fixture trip (./recap-world.ts), ElevenLabs answered at the network
 * boundary and R2 kept in memory: every card with words is read once in the guide's voice and
 * stored as trip media no traveller owns; a re-run over the same words makes no call; a card whose
 * call fails keeps its text and the recap stays ready, and the next run records only that card. A
 * viewer reading Vietnamese waits for the copy's translation, then gets it read in Vietnamese while
 * English makes no call; the translation sweep carries the recap and its awards; with a model the
 * lines are recorded again with audio tags that never reach the recap's own words; and purging the
 * account of a viewer leaves the crew's narration in place.
 */
import { purgeAccount, withSystem } from '@cp/db';
import { guideTextSourceHash, recapGuideTextSource } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createElevenLabs } from '../../src/jobs/guide/elevenlabs';
import { loadTripSweep } from '../../src/jobs/i18n/rows';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { buildRecap } from '../../src/jobs/recap/build';
import { narrateRecap, type RecapVoice } from '../../src/jobs/recap/narrate';
import { startRecapWorld, type RecapWorld } from './recap-world';

let world: RecapWorld;
let recapId: string;
const calls: { text: string; language: string }[] = [];
let failNext = 0;
const objects = new Map<string, Uint8Array>();

const voice: RecapVoice = {
  tts: createElevenLabs({
    apiKey: 'test',
    fetch: (_input, init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        text: string;
        language_code: string;
      };
      calls.push({ text: body.text, language: body.language_code });
      if (failNext > 0) {
        failNext -= 1;
        return Promise.resolve(new Response('busy', { status: 429 }));
      }
      return Promise.resolve(new Response(new Uint8Array([0xff, 0xfb, 0x90]), { status: 200 }));
    },
  }),
  store: {
    put: (key, bytes) => {
      objects.set(key, bytes);
      return Promise.resolve();
    },
  },
  defaultVoiceId: 'voice-default',
};

const CARDS = ['awards', 'cover', 'critters', 'got_away', 'postcard', 'receipt', 'route', 'stamp'];

beforeAll(async () => {
  world = await startRecapWorld();
  const built = await buildRecap(
    world.harness.pool,
    { trip_id: world.tripId, reason: 'trip_ended', ended_on: '2026-10-04' },
    { router: straightLineRouter },
  );
  if (built.outcome !== 'built') throw new Error('the fixture recap did not build');
  recapId = built.recap_id;
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

type Narration = Record<string, Record<string, { media_key: string; hash: string }>>;

async function narration(): Promise<Narration> {
  const [row] = await world.q<{ narration: Narration }>(
    'SELECT narration FROM recaps WHERE id = $1',
    [recapId],
  );
  return row!.narration;
}

describe('recap.narrate', { timeout: 60_000 }, () => {
  it('reads nothing aloud without a voice, and the recap stays ready', async () => {
    expect(await narrateRecap(world.harness.pool, recapId, undefined)).toEqual({
      outcome: 'no_voice',
    });
    expect(await world.q('SELECT status FROM recaps WHERE id = $1', [recapId])).toEqual([
      { status: 'ready' },
    ]);
  });

  it('keeps a card whose call failed as text, and records the rest', async () => {
    failNext = 1;
    const outcome = await narrateRecap(world.harness.pool, recapId, voice);
    expect(outcome).toEqual({ outcome: 'narrated', recorded: 7, failed: 1, waiting: [] });
    expect(Object.keys((await narration())['en'] ?? {})).toHaveLength(7);
    expect(await world.q('SELECT status FROM recaps WHERE id = $1', [recapId])).toEqual([
      { status: 'ready' },
    ]);
  });

  it('records only what is missing next time, then nothing at all, as trip media', async () => {
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toMatchObject({
      recorded: 1,
      failed: 0,
    });
    expect(calls).toHaveLength(1);
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toMatchObject({
      recorded: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);

    const cards = (await narration())['en'] ?? {};
    expect(Object.keys(cards).sort()).toEqual(CARDS);
    const keys = Object.values(cards).map((card) => card.media_key);
    expect(keys.every((key) => objects.has(key))).toBe(true);
    expect(keys.every((key) => key.startsWith(`t/${world.tripId}/recap_audio/`))).toBe(true);
    const media = await world.q<{ owner_id: string | null; purpose: string; trip_id: string }>(
      'SELECT DISTINCT owner_id, purpose, trip_id FROM media_objects WHERE r2_key = ANY($1)',
      [keys],
    );
    expect(media).toEqual([{ owner_id: null, purpose: 'recap_audio', trip_id: world.tripId }]);
  });

  it('carries the recap and its awards in the trip’s translation sweep', async () => {
    const sweep = await withSystem(world.harness.pool, (tx) => loadTripSweep(tx, world.tripId));
    const recap = sweep?.rows.find((row) => row.kind === 'recap');
    expect(recap?.source['cover_narration']).toBe(
      "3 days in Da Nang, 5 travellers. Here's how it went.",
    );
    expect(sweep?.rows.filter((row) => row.kind === 'recap_award')).toHaveLength(5);
  });

  it('reads a Vietnamese viewer the translated copy once it exists, English making no call', async () => {
    await world.q(
      `INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'vi')
       ON CONFLICT (user_id) DO UPDATE SET app_locale = 'vi'`,
      [world.users.cora],
    );
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toEqual({
      outcome: 'narrated',
      recorded: 0,
      failed: 0,
      waiting: ['vi'],
    });

    // What guide_text.translate stores: every card's words in Vietnamese, the receipt's refused.
    const [row] = await world.q<{ cards: unknown }>('SELECT cards FROM recaps WHERE id = $1', [
      recapId,
    ]);
    const source = recapGuideTextSource(row!.cards);
    const vi: Record<string, string | null> = {};
    for (const [field, text] of Object.entries(source)) {
      if (text !== null && text !== '') vi[field] = `[vi] ${text}`;
    }
    vi['receipt_narration'] = null;
    await world.q('UPDATE recaps SET i18n = $2 WHERE id = $1', [
      recapId,
      JSON.stringify({ _src: guideTextSourceHash('recap', source), vi }),
    ]);

    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toEqual({
      outcome: 'narrated',
      recorded: 8,
      failed: 0,
      waiting: [],
    });
    expect(calls.filter((call) => call.language === 'vi')).toHaveLength(7);
    expect(calls.filter((call) => call.language === 'en')).toEqual([
      { text: source['receipt_narration'], language: 'en' },
    ]);
    expect(Object.keys((await narration())['vi'] ?? {}).sort()).toEqual(CARDS);
    calls.length = 0;
    await narrateRecap(world.harness.pool, recapId, voice);
    expect(calls).toEqual([]);
  });

  it('tags lines for the voice only: recorded again with the tags, the recap keeping its words', async () => {
    const [before] = await world.q<{ cards: unknown; i18n: unknown }>(
      'SELECT cards, i18n FROM recaps WHERE id = $1',
      [recapId],
    );
    const source = recapGuideTextSource(before!.cards);
    const cover = source['cover_narration'] ?? '';
    const requests: string[] = [];
    // The model tags the cover, rewords the stamp, and says nothing of the other cards.
    const tagging: RecapVoice = {
      ...voice,
      writer: () => ({
        callModel: (route, input) => {
          requests.push(`${route} ${JSON.stringify(input.messages)}`);
          const lines = [
            { card: 'cover', text: `[warmly] ${cover}` },
            { card: 'stamp', text: '[proudly] Stamped, signed and sealed!' },
          ];
          return Promise.resolve({
            message: { content: [{ type: 'text', text: JSON.stringify({ lines }) }] },
          }) as never;
        },
      }),
    };
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, tagging)).toEqual({
      outcome: 'narrated',
      recorded: 16,
      failed: 0,
      waiting: [],
    });
    // One tagging call per language read, each carrying that language's lines.
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.startsWith('recap.narration '))).toBe(true);
    const english = calls.filter((call) => call.language === 'en').map((call) => call.text);
    expect(english).toContain(`[warmly] ${cover}`);
    expect(english).toContain(source['stamp_narration']);
    expect(english.filter((text) => text.includes('[warmly]'))).toHaveLength(1);
    expect(calls.some((call) => call.text.includes('Stamped, signed and sealed'))).toBe(false);
    expect(await world.q('SELECT cards, i18n FROM recaps WHERE id = $1', [recapId])).toEqual([
      before,
    ]);

    calls.length = 0;
    requests.length = 0;
    await narrateRecap(world.harness.pool, recapId, tagging);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("keeps the crew's narration when a viewer's account is purged", async () => {
    const before = await narration();
    const { anna } = world.users;
    await world.q(
      `INSERT INTO account_deletions (user_id, purge_at, source) VALUES ($1, now(), 'app')`,
      [anna],
    );
    const purged = await withSystem(world.harness.pool, (tx) => purgeAccount(tx, anna));
    expect(purged).not.toBeNull();
    expect(await narration()).toEqual(before);
    const keys = Object.values(before).flatMap((cards) =>
      Object.values(cards).map((c) => c.media_key),
    );
    const media = await world.q('SELECT 1 FROM media_objects WHERE r2_key = ANY($1)', [keys]);
    expect(media).toHaveLength(keys.length);
  });
});
