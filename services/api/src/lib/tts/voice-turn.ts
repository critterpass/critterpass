/**
 * A spoken guide turn: the answer's text events pass through untouched and, between them, the
 * same words come out as ordered `audio{seq, b64}` events as each piece is synthesised. The turn's
 * `done` waits for the last piece, so the app has every chunk before the stream closes. A failed
 * synthesis ends the audio only: the text keeps streaming and the reply is read instead of heard.
 * When the guide looks something up before it has said anything, it says one short filler line
 * first (./filler-lines.ts): spoken only, never part of the reply's text.
 */
import type { TurnEvent } from '@cp/ai';
import { metrics } from '@opentelemetry/api';
import type pg from 'pg';

import { elevenLabsSynthesizer, type Synthesize } from './elevenlabs';
import { fillerLine } from './filler-lines';
import { speakReply, type AudioChunk } from './voice-reply';

export interface SpokenTurnOptions {
  readonly voiceId: string;
  readonly language: string;
  readonly synthesize: Synthesize;
  /** Milliseconds from the answer's first text to its first audio chunk. */
  readonly onFirstAudio?: (ms: number) => void;
  readonly onFailed?: (error: unknown) => void;
  readonly now?: () => number;
}

/** Text deltas handed over as they arrive; `end` closes the stream. */
function textQueue() {
  const buffered: string[] = [];
  let ended = false;
  let wake: (() => void) | undefined;
  const signal = () => {
    wake?.();
    wake = undefined;
  };
  return {
    push(text: string) {
      buffered.push(text);
      signal();
    },
    end() {
      ended = true;
      signal();
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<string> {
      for (;;) {
        const next = buffered.shift();
        if (next !== undefined) yield next;
        else if (ended) return;
        else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
    },
  };
}

type Turn = AsyncGenerator<TurnEvent, void, undefined>;
type AudioStep = { readonly chunk: AudioChunk } | { readonly over: true };

export async function* speakTurn(events: Turn, options: SpokenTurnOptions): Turn {
  const text = textQueue();
  const abort = new AbortController();
  const audio = speakReply(text, {
    voiceId: options.voiceId,
    language: options.language,
    synthesize: options.synthesize,
    signal: abort.signal,
    ...(options.onFirstAudio ? { onFirstAudio: options.onFirstAudio } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const nextAudio = (): Promise<AudioStep> =>
    audio.next().then(
      (step) => (step.done === true ? { over: true } : { chunk: step.value }),
      (error: unknown) => {
        options.onFailed?.(error);
        return { over: true };
      },
    );
  const spoken = (chunk: AudioChunk): TurnEvent => ({
    type: 'audio',
    seq: chunk.seq,
    b64: chunk.b64,
  });

  let audioStep: Promise<AudioStep> | null = nextAudio();
  let eventStep = events.next();
  /** The reply has words of its own, or a filler line was said: no filler after either. */
  let voiced = false;
  try {
    for (;;) {
      const winner = await Promise.race([
        eventStep.then((step) => ({ event: step })),
        ...(audioStep === null ? [] : [audioStep.then((step) => ({ audio: step }))]),
      ]);
      if ('audio' in winner) {
        if ('over' in winner.audio) audioStep = null;
        else {
          yield spoken(winner.audio.chunk);
          audioStep = nextAudio();
        }
        continue;
      }
      if (winner.event.done === true) return;
      const event = winner.event.value;
      if (event.type === 'token') {
        text.push(event.text);
        voiced ||= event.text.trim() !== '';
      } else if (event.type === 'tool_start' && !voiced) {
        const filler = fillerLine(event.tool, options.language);
        if (filler !== null) {
          voiced = true;
          text.push(`${filler} `);
        }
      }
      if (event.type === 'error') abort.abort();
      if (event.type === 'done' || event.type === 'error') {
        text.end();
        // Every remaining piece goes out before the turn closes (none after an error).
        while (audioStep !== null) {
          const step = await audioStep;
          if ('over' in step) audioStep = null;
          else {
            if (event.type === 'done') yield spoken(step.chunk);
            audioStep = nextAudio();
          }
        }
      }
      yield event;
      eventStep = events.next();
    }
  } finally {
    text.end();
    abort.abort();
    await audio.return(undefined).catch(() => undefined);
    await events.return(undefined);
  }
}

/** What a guide turn needs to answer out loud. */
export interface VoiceTurnDeps {
  readonly synthesize: Synthesize;
  /** The guide's own voice (`guides.voice_id`), else the stock voice; null: no voice, text only. */
  readonly voiceFor: (guideSlug: string | null) => Promise<string | null>;
  readonly onFirstAudio: (ms: number) => void;
}

/**
 * Spoken replies from `ELEVENLABS_API_KEY` (and `ELEVENLABS_VOICE_ID` as the stock voice for a
 * guide without its own). Unset: voice turns answer in text. Time to first audio is recorded on
 * the `cp_voice_first_audio_ms` histogram.
 */
export function voiceTurnDepsFromEnv(
  pool: pg.Pool,
  env: Readonly<Record<string, string | undefined>>,
): VoiceTurnDeps | undefined {
  const key = env['ELEVENLABS_API_KEY']?.trim();
  if (!key) return undefined;
  const stock = env['ELEVENLABS_VOICE_ID']?.trim() || null;
  const firstAudio = metrics.getMeter('critterpass').createHistogram('cp_voice_first_audio_ms', {
    unit: 'ms',
    description: 'Voice turn: first answer text to first audio chunk',
  });
  return {
    synthesize: elevenLabsSynthesizer(key),
    voiceFor: async (guideSlug) => {
      if (guideSlug === null) return stock;
      const { rows } = await pool.query<{ voice_id: string | null }>(
        'SELECT voice_id FROM guides WHERE slug = $1',
        [guideSlug],
      );
      return rows[0]?.voice_id ?? stock;
    },
    onFirstAudio: (ms) => firstAudio.record(ms),
  };
}
