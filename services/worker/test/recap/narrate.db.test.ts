/**
 * Recap narration against the fixture trip (./recap-world.ts), ElevenLabs answered at the network
 * boundary and R2 kept in memory: every card with words is read once in the guide's voice and
 * stored as a trip media object; a re-run over the same words makes no call; a card whose call
 * fails keeps its text and the recap stays ready, and the next run records only that card.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createElevenLabs } from '../../src/jobs/guide/elevenlabs';
import { straightLineRouter } from '../../src/jobs/live-map/meetup-router';
import { buildRecap } from '../../src/jobs/recap/build';
import { narrateRecap, type RecapVoice } from '../../src/jobs/recap/narrate';
import { startRecapWorld, type RecapWorld } from './recap-world';

let world: RecapWorld;
let recapId: string;
const calls: string[] = [];
let failNext = 0;
const objects = new Map<string, Uint8Array>();

const voice: RecapVoice = {
  tts: createElevenLabs({
    apiKey: 'test',
    fetch: (_input, init) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        text: string;
      };
      calls.push(body.text);
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

async function narration(): Promise<Record<string, Record<string, { media_key: string }>>> {
  const [row] = await world.q<{ narration: Record<string, Record<string, { media_key: string }>> }>(
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
    expect(outcome).toEqual({ outcome: 'narrated', recorded: 7, failed: 1 });
    expect(Object.keys((await narration())['en'] ?? {})).toHaveLength(7);
    expect(await world.q('SELECT status FROM recaps WHERE id = $1', [recapId])).toEqual([
      { status: 'ready' },
    ]);
  });

  it('records only what is missing next time, then nothing at all', async () => {
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toEqual({
      outcome: 'narrated',
      recorded: 1,
      failed: 0,
    });
    expect(calls).toHaveLength(1);
    calls.length = 0;
    expect(await narrateRecap(world.harness.pool, recapId, voice)).toEqual({
      outcome: 'narrated',
      recorded: 0,
      failed: 0,
    });
    expect(calls).toEqual([]);

    const cards = (await narration())['en'] ?? {};
    expect(Object.keys(cards).sort()).toEqual(
      ['awards', 'cover', 'critters', 'got_away', 'postcard', 'receipt', 'route', 'stamp'].sort(),
    );
    const keys = Object.values(cards).map((card) => card.media_key);
    expect(keys.every((key) => objects.has(key))).toBe(true);
    const media = await world.q<{ purpose: string; trip_id: string }>(
      'SELECT DISTINCT purpose, trip_id FROM media_objects WHERE r2_key = ANY($1)',
      [keys],
    );
    expect(media).toEqual([{ purpose: 'recap_audio', trip_id: world.tripId }]);
  });
});
