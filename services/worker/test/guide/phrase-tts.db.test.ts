/**
 * `phrase.tts`: a custom address card is written by the model (the member's purpose as data, the
 * address kept verbatim and never sent), then either recorded in the guide's voice (ElevenLabs
 * answered at the network boundary: one model for every language) and stored for the
 * offline bundle, or, with no voice configured, marked for on-device speech.
 */
import { randomUUID } from 'node:crypto';

import { packFor } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../../src/boss';
import { createElevenLabs } from '../../src/jobs/guide/elevenlabs';
import { phraseTtsJob } from '../../src/jobs/guide/phrase-tts';
import { guideReader } from '../../src/jobs/guide/runtime';
import { insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { crewTrip, fakeModel, testRuntime } from './guide-fixtures';

let db: NotifyDb;
let uid: string;
let tripId: string;

const ADDRESS = '12 Jalan Bisma, Ubud';
const ctx = { job: { isFinalAttempt: false } } as unknown as JobContext;

beforeAll(async () => {
  db = await startNotifyDb();
  uid = await insertUser(db.pool);
  ({ tripId } = await crewTrip(db.pool, [uid]));
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function card(language: string): Promise<string> {
  const id = randomUUID();
  await db.pool.query(
    `INSERT INTO custom_phrase_cards (id, user_id, trip_id, purpose, language, register, address)
     VALUES ($1, $2, $3, 'Please take me to this address', $4, 'polite', $5)`,
    [id, uid, tripId, language, ADDRESS],
  );
  return id;
}

async function stored(id: string) {
  const { rows } = await db.pool.query<{
    text: string;
    gloss: string;
    audio_key: string | null;
    audio_status: string;
  }>('SELECT text, gloss, audio_key, audio_status FROM custom_phrase_cards WHERE id = $1', [id]);
  return rows[0];
}

describe('phrase.tts', () => {
  it('writes the card and leaves it to on-device speech without a voice', async () => {
    const id = await card('id');
    const model = fakeModel(() => 'Tolong antar saya ke alamat ini');
    const job = phraseTtsJob(testRuntime(db.pool, model), undefined);
    expect(await job.handler({ card_id: id }, ctx)).toEqual({ outcome: 'device' });
    expect(await stored(id)).toEqual({
      text: `Tolong antar saya ke alamat ini\n${ADDRESS}`,
      gloss: `Please take me to this address\n${ADDRESS}`,
      audio_key: null,
      audio_status: 'device',
    });
    const request = JSON.stringify(model.requests[0]);
    expect(request).toContain('Please take me to this address');
    expect(request).not.toContain('Jalan Bisma');
    // A finished card is not redone.
    expect(await job.handler({ card_id: id }, ctx)).toEqual({ outcome: 'done' });
  });

  it('records the card in the guide’s voice and stores it for the offline bundle', async () => {
    const calls: { url: string; body: { model_id: string; text: string } }[] = [];
    const tts = createElevenLabs({
      apiKey: 'test',
      fetch: (input, init) => {
        calls.push({
          url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as never,
        });
        return Promise.resolve(new Response(new Uint8Array([0xff, 0xfb, 0x90]), { status: 200 }));
      },
    });
    const objects = new Map<string, Uint8Array>();
    const voice = {
      tts,
      store: {
        put: (key: string, bytes: Uint8Array) => {
          objects.set(key, bytes);
          return Promise.resolve();
        },
      },
      defaultVoiceId: 'voice-default',
    };
    const indonesian = await card('id');
    const icelandic = await card('is');
    const job = phraseTtsJob(
      testRuntime(
        db.pool,
        fakeModel(() => 'Vinsamlegast'),
      ),
      voice,
    );
    expect(await job.handler({ card_id: indonesian }, ctx)).toEqual({ outcome: 'ready' });
    expect(await job.handler({ card_id: icelandic }, ctx)).toEqual({ outcome: 'ready' });

    expect(calls.map((call) => call.body.model_id)).toEqual(['eleven_v4', 'eleven_v4']);
    const guide = await packFor(guideReader(db.pool), uid, tripId, null);
    expect(guide.voice_id).toEqual(expect.any(String));
    expect(calls[0]?.url).toContain(`/v1/text-to-speech/${guide.voice_id ?? 'voice-default'}`);
    const card1 = await stored(indonesian);
    expect(card1?.audio_status).toBe('ready');
    const key = card1?.audio_key ?? '';
    expect(key).toMatch(new RegExp(`^u/${uid}/phrase_audio/[0-9a-f-]{36}$`));
    expect(objects.get(key)).toEqual(new Uint8Array([0xff, 0xfb, 0x90]));
    // Registered like an upload, on the card's trip, so read URLs reach the owner and the crew.
    const { rows } = await db.pool.query(
      'SELECT owner_id, kind, bytes, purpose, trip_id FROM media_objects WHERE r2_key = $1',
      [key],
    );
    expect(rows).toEqual([
      { owner_id: uid, kind: 'audio/mpeg', bytes: '3', purpose: 'phrase_audio', trip_id: tripId },
    ]);
  });
});
