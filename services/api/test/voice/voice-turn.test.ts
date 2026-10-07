/**
 * A spoken guide turn: text events pass through unchanged and in order, every piece of the answer
 * comes out as numbered audio before `done`, and a failed synthesis leaves a complete text reply.
 * A lookup before the guide has said anything is covered by one spoken filler line, in the reply's
 * language, that never joins the reply's text.
 */
import type { TurnEvent } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { speakTurn, type Synthesize } from '../../src/lib/tts';

const DONE: TurnEvent = { type: 'done', ai_generated: true, sources: [] };

async function* turn(events: readonly TurnEvent[]) {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
}

async function collect(events: AsyncGenerator<TurnEvent, void, undefined>) {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

/** Synthesis doubled at the network boundary: the "audio" is the text it was asked to speak. */
const echo: Synthesize = async function* (request) {
  await Promise.resolve();
  yield new TextEncoder().encode(request.text);
};

const ANSWER: readonly TurnEvent[] = [
  { type: 'token', text: 'The rain stops around four, ' },
  { type: 'token', text: 'so the night market is fine. ' },
  { type: 'token', text: 'Take the bus from the pier.' },
  { type: 'usage', used: 3, limit: 30, reset_at: '2026-10-08T00:00:00.000Z' },
  DONE,
];

const spokenText = (events: readonly TurnEvent[]) =>
  events.flatMap((event) =>
    event.type === 'audio' ? [Buffer.from(event.b64 ?? '', 'base64').toString('utf8')] : [],
  );

describe('speakTurn', () => {
  it('streams the text untouched and speaks all of it, in order, before done', async () => {
    const firstAudio: number[] = [];
    const out = await collect(
      speakTurn(turn(ANSWER), {
        voiceId: 'voice-tokek',
        language: 'en',
        synthesize: echo,
        onFirstAudio: (ms) => firstAudio.push(ms),
      }),
    );
    expect(out.filter((event) => event.type !== 'audio')).toEqual(ANSWER);
    const audio = out.filter((event) => event.type === 'audio');
    expect(audio.map((event) => (event.type === 'audio' ? event.seq : -1))).toEqual(
      audio.map((_, index) => index),
    );
    expect(spokenText(out).join(' ')).toBe(
      'The rain stops around four, so the night market is fine. Take the bus from the pier.',
    );
    expect(out.at(-1)).toEqual(DONE);
    expect(firstAudio).toHaveLength(1);
  });

  it('keeps the whole text reply when synthesis fails', async () => {
    const failures: unknown[] = [];
    const broken: Synthesize = async function* () {
      await Promise.resolve();
      throw new Error('ElevenLabs answered HTTP 503');
      yield new Uint8Array();
    };
    const out = await collect(
      speakTurn(turn(ANSWER), {
        voiceId: 'voice-tokek',
        language: 'en',
        synthesize: broken,
        onFailed: (error) => failures.push(error),
      }),
    );
    expect(out).toEqual(ANSWER);
    expect(failures).toHaveLength(1);
  });

  it('speaks nothing more once the turn errors', async () => {
    const error: TurnEvent = { type: 'error', code: 'AI_UNAVAILABLE', retryable: true };
    const out = await collect(
      speakTurn(turn([{ type: 'token', text: 'Checking' }, error]), {
        voiceId: 'voice-tokek',
        language: 'en',
        synthesize: echo,
      }),
    );
    expect(out.at(-1)).toEqual(error);
    expect(out.filter((event) => event.type === 'audio')).toEqual([]);
  });

  describe('while the guide looks something up', () => {
    const LOOKUP: readonly TurnEvent[] = [
      { type: 'tool_start', tool: 'weather', id: 't1' },
      { type: 'tool_result', id: 't1', card: { tool: 'weather', status: 'ok' } },
      { type: 'tool_start', tool: 'plan_read', id: 't2' },
      { type: 'token', text: 'The rain stops around four, so keep the night market. ' },
      DONE,
    ];
    const speak = (events: readonly TurnEvent[], language: string) =>
      collect(speakTurn(turn(events), { voiceId: 'voice-tokek', language, synthesize: echo }));

    it('says one filler line first, and keeps it out of the text', async () => {
      const out = await speak(LOOKUP, 'en');
      expect(spokenText(out)).toEqual([
        'Let me check the weather.',
        'The rain stops around four, so keep the night market.',
      ]);
      expect(out.filter((event) => event.type !== 'audio')).toEqual(LOOKUP);
      // The filler is heard before the answer's first words arrive.
      const filler = out.findIndex((event) => event.type === 'audio');
      expect(filler).toBeLessThan(out.findIndex((event) => event.type === 'token'));
    });

    it('says it in the language of the reply, and nothing in a language it has no line for', async () => {
      expect(spokenText(await speak(LOOKUP, 'vi-VN'))[0]).toBe('Để mình xem thời tiết nhé.');
      expect(spokenText(await speak(LOOKUP, 'ja')).join(' ')).toBe(
        'The rain stops around four, so keep the night market.',
      );
    });

    it('says none once the reply has words of its own', async () => {
      const midway: readonly TurnEvent[] = [
        { type: 'token', text: 'Good question, let me see. ' },
        { type: 'tool_start', tool: 'weather', id: 't1' },
        { type: 'token', text: 'It is dry until four.' },
        DONE,
      ];
      expect(spokenText(await speak(midway, 'en'))).toEqual([
        'Good question, let me see.',
        'It is dry until four.',
      ]);
    });
  });
});
