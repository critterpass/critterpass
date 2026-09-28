/**
 * `chat.voice_transcode`: normalises a chat voice note to mono AAC at 32 kbps in an M4A container
 * (capped at two minutes), measures its real duration and computes the waveform peaks the bubble
 * draws. ffmpeg runs as a child process on temporary files that are removed afterwards.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { CHAT_VOICE_TRANSCODE_QUEUE, chatMediaJobSchema, VOICE_NOTE_MAX_MS } from '@cp/domain';

import { defineJob, type JobDefinition } from '../../boss';
import { derivedKey, loadMediaMessage, saveDerived, type ChatMediaStore } from './attachments';

const run = promisify(execFile);

export const VOICE_BITRATE = '32k';
export const WAVEFORM_BARS = 48;
const PEAK_SAMPLE_RATE = 8000;

export interface TranscodedVoice {
  readonly m4a: Uint8Array;
  readonly durationMs: number;
  readonly peaks: number[];
}

/** Largest absolute sample per bar, scaled to 0–1 against the loudest bar. */
export function waveformPeaks(pcm: Uint8Array, bars = WAVEFORM_BARS): number[] {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  if (samples.length === 0) return Array.from({ length: bars }, () => 0);
  const size = Math.max(1, Math.ceil(samples.length / bars));
  const raw: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    let peak = 0;
    for (let i = bar * size; i < Math.min(samples.length, (bar + 1) * size); i += 1) {
      peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    }
    raw.push(peak);
  }
  const loudest = Math.max(...raw, 1);
  return raw.map((peak) => Math.round((peak / loudest) * 100) / 100);
}

export async function transcodeVoice(
  input: Uint8Array,
  ffmpeg = 'ffmpeg',
): Promise<TranscodedVoice> {
  const dir = await mkdtemp(path.join(tmpdir(), 'cp-voice-'));
  try {
    const source = path.join(dir, 'in');
    const output = path.join(dir, 'out.m4a');
    const pcm = path.join(dir, 'out.pcm');
    await writeFile(source, input);
    const limit = String(VOICE_NOTE_MAX_MS / 1000);
    await run(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      source,
      '-t',
      limit,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '24000',
      '-c:a',
      'aac',
      '-b:a',
      VOICE_BITRATE,
      '-movflags',
      '+faststart',
      output,
    ]);
    await run(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      output,
      '-ac',
      '1',
      '-ar',
      String(PEAK_SAMPLE_RATE),
      '-f',
      's16le',
      pcm,
    ]);
    const samples = await readFile(pcm);
    const m4a = await readFile(output);
    return {
      m4a: new Uint8Array(m4a),
      durationMs: Math.min(
        VOICE_NOTE_MAX_MS,
        Math.round((samples.byteLength / 2 / PEAK_SAMPLE_RATE) * 1000),
      ),
      peaks: waveformPeaks(new Uint8Array(samples)),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function chatVoiceTranscodeJob(options: {
  readonly store: ChatMediaStore;
  readonly ffmpeg?: string;
}): JobDefinition<{ message_id: string }> {
  return defineJob({
    queue: CHAT_VOICE_TRANSCODE_QUEUE,
    schema: chatMediaJobSchema,
    singletonKey: (data) => data.message_id,
    handler: async (data, ctx) => {
      const message = await loadMediaMessage(ctx.pool, data.message_id);
      if (message === undefined) return { skipped: 'gone' };
      const voice = message.attachments.find((attachment) => attachment.kind === 'voice');
      if (voice === undefined || voice.derived_key) return { skipped: 'done' };
      const source = await options.store.get(voice.media_key);
      if (source === null) throw new Error(`chat voice note ${voice.media_id} is not uploaded yet`);
      const result = await transcodeVoice(source.bytes, options.ffmpeg);
      await saveDerived(
        ctx.pool,
        options.store,
        message,
        voice.media_id,
        {
          key: derivedKey(message.sender_id, 'voice', message.id, voice.media_id),
          bytes: result.m4a,
          contentType: 'audio/mp4',
          purpose: 'voice',
        },
        { duration_ms: result.durationMs, peaks: result.peaks },
      );
      return { duration_ms: result.durationMs };
    },
  });
}
