/**
 * Spoken guide replies: the sentence chunker, the ElevenLabs streaming request, and ordered
 * `audio{seq}` chunks however the syntheses finish.
 */
import { describe, expect, it } from 'vitest';

import {
  createSentenceChunker,
  elevenLabsSynthesizer,
  FALLBACK_MODEL,
  FLASH_MODEL,
  modelFor,
  speakReply,
  type Synthesize,
} from '../../src/lib/tts';

async function* stream(pieces: readonly string[]) {
  for (const piece of pieces) yield piece;
}

describe('sentence chunker', () => {
  it('lets the first piece go at a clause break, later ones at sentence ends', () => {
    const chunker = createSentenceChunker();
    const out = [
      ...chunker.push('The rain stops around four, '),
      ...chunker.push('so the night market is fine. Take the 32 bus. It runs every '),
      ...chunker.push('ten minutes from the pier, about 45.000đ a ride.'),
      ...chunker.flush(),
    ];
    expect(out).toEqual([
      'The rain stops around four,',
      'so the night market is fine.',
      'Take the 32 bus.',
      'It runs every ten minutes from the pier, about 45.000đ a ride.',
    ]);
  });

  it('splits CJK sentences without spaces and cuts a run-on at a space', () => {
    const cjk = createSentenceChunker({ firstClauseChars: 100, minChars: 2 });
    expect(cjk.push('雨は四時に止みます。夜市は大丈夫です。')).toEqual([
      '雨は四時に止みます。',
      '夜市は大丈夫です。',
    ]);
    const long = createSentenceChunker({ maxChars: 30 });
    const [first] = long.push('word '.repeat(10));
    expect(first!.length).toBeLessThanOrEqual(30);
    expect(first!.endsWith('word')).toBe(true);
  });
});

describe('ElevenLabs synthesis', () => {
  it('picks Flash where it speaks the language and v3 elsewhere', () => {
    expect(modelFor('vi-VN')).toBe(FLASH_MODEL);
    expect(modelFor('id')).toBe(FLASH_MODEL);
    expect(modelFor('th-TH')).toBe(FALLBACK_MODEL);
  });

  it('streams the MP3 body of one request', async () => {
    // An MP3 stream as ElevenLabs sends it: frames split across network reads.
    const body = [
      Uint8Array.of(0xff, 0xfb, 0x90, 0x64),
      Uint8Array.of(0x00, 0x0f),
      Uint8Array.of(0xf0),
    ];
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              for (const part of body) controller.enqueue(part);
              controller.close();
            },
          }),
          { headers: { 'content-type': 'audio/mpeg' } },
        ),
      );
    }) as unknown as typeof fetch;
    const parts: number[][] = [];
    for await (const part of elevenLabsSynthesizer(
      'xi-key',
      fetchImpl,
    )({
      voiceId: 'tokek-voice',
      text: 'Xin chào!',
      language: 'vi-VN',
      previousText: 'Chào bạn.',
    })) {
      parts.push([...part]);
    }
    expect(parts).toEqual(body.map((part) => [...part]));
    expect(calls[0]!.url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/tokek-voice/stream?output_format=mp3_44100_128',
    );
    expect((calls[0]!.init.headers as Record<string, string>)['xi-api-key']).toBe('xi-key');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      text: 'Xin chào!',
      model_id: FLASH_MODEL,
      language_code: 'vi',
      previous_text: 'Chào bạn.',
    });
  });

  it('fails with the status when ElevenLabs refuses', async () => {
    const refused = (() =>
      Promise.resolve(new Response('quota', { status: 429 }))) as unknown as typeof fetch;
    const run = async () => {
      for await (const _ of elevenLabsSynthesizer(
        'k',
        refused,
      )({ voiceId: 'v', text: 'Hi', language: 'en' })) {
        // drain
      }
    };
    await expect(run()).rejects.toMatchObject({ name: 'TtsError', status: 429 });
  });
});

describe('speakReply', () => {
  it('numbers the pieces from 0 in reply order however the syntheses finish', async () => {
    const delays = [40, 5, 25, 1];
    let call = 0;
    const requests: { text: string; previousText?: string }[] = [];
    const synthesize: Synthesize = async function* (request) {
      const delay = delays[call++] ?? 1;
      requests.push({
        text: request.text,
        ...(request.previousText ? { previousText: request.previousText } : {}),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
      yield Buffer.from(`mp3:${request.text}`);
    };
    let firstAudio = -1;
    const chunks = [];
    for await (const chunk of speakReply(
      stream([
        'Checking the rain radar now, ',
        'it clears by four. ',
        'The market opens at five. Bring cash. ',
        'Grab works too.',
      ]),
      { voiceId: 'tokek', language: 'en', synthesize, onFirstAudio: (ms) => (firstAudio = ms) },
    )) {
      chunks.push(chunk);
    }
    expect(chunks.map((c) => c.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(chunks.map((c) => Buffer.from(c.b64, 'base64').toString())).toEqual([
      'mp3:Checking the rain radar now,',
      'mp3:it clears by four.',
      'mp3:The market opens at five.',
      'mp3:Bring cash.',
      'mp3:Grab works too.',
    ]);
    expect(requests[1]).toEqual({
      text: 'it clears by four.',
      previousText: 'Checking the rain radar now,',
    });
    expect(firstAudio).toBeGreaterThanOrEqual(0);
  });

  it('stops with the error of a failed piece', async () => {
    const synthesize: Synthesize = async function* () {
      await Promise.resolve();
      throw new Error('tts down');
      yield new Uint8Array();
    };
    const run = async () => {
      for await (const _ of speakReply(stream(['Hello there, friend.']), {
        voiceId: 'v',
        language: 'en',
        synthesize,
      })) {
        // drain
      }
    };
    await expect(run()).rejects.toThrow('tts down');
  });
});
