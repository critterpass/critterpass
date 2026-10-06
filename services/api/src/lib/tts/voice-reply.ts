import { createSentenceChunker, type ChunkerOptions } from './sentence-chunker';
import type { Synthesize } from './elevenlabs';

/** One `audio{seq, b64}` event of a voice turn: a whole piece of the reply as MP3. */
export interface AudioChunk {
  readonly seq: number;
  readonly b64: string;
  /** The words this chunk speaks, so a reply cut short by barge-in keeps the rest as text. */
  readonly text: string;
}

export interface VoiceReplyOptions {
  readonly voiceId: string;
  readonly language: string;
  readonly synthesize: Synthesize;
  readonly chunker?: ChunkerOptions;
  readonly signal?: AbortSignal;
  /** Milliseconds from the first text to the first audio chunk (time to first audio). */
  readonly onFirstAudio?: (ms: number) => void;
  readonly now?: () => number;
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

/**
 * Speaks a streamed reply: text pieces from the sentence chunker are synthesised as soon as each
 * completes (the next one while the previous is still being made) and come out in order, numbered
 * from 0. Each chunk is a whole MP3 piece, so the app can queue it without splitting frames.
 */
export async function* speakReply(
  text: AsyncIterable<string>,
  options: VoiceReplyOptions,
): AsyncGenerator<AudioChunk> {
  const now = options.now ?? Date.now;
  const chunker = createSentenceChunker(options.chunker);
  const pending: { text: string; audio: Promise<Buffer> }[] = [];
  let previous: string | undefined;
  let started: number | null = null;
  let seq = 0;

  const start = (piece: string) => {
    const audio = collect(
      options.synthesize(
        {
          voiceId: options.voiceId,
          text: piece,
          language: options.language,
          ...(previous ? { previousText: previous } : {}),
        },
        options.signal,
      ),
    );
    // Settled here so an early failure is not an unhandled rejection; it rethrows when awaited.
    audio.catch(() => {});
    pending.push({ text: piece, audio });
    previous = piece;
  };

  const ready = async function* (all: boolean) {
    while (pending.length > 0 && (all || pending.length > 1)) {
      const head = pending.shift()!;
      const audio = await head.audio;
      if (seq === 0 && started !== null) options.onFirstAudio?.(now() - started);
      yield { seq, b64: audio.toString('base64'), text: head.text };
      seq += 1;
    }
  };

  for await (const delta of text) {
    started ??= now();
    for (const piece of chunker.push(delta)) start(piece);
    // The first piece goes out as soon as it is made; later ones keep one in flight behind it.
    if (seq === 0 && pending.length > 0) {
      yield* ready(true);
    } else {
      yield* ready(false);
    }
  }
  for (const piece of chunker.flush()) start(piece);
  yield* ready(true);
}
