import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { encodeWav } from './wav';

export type EncodeFormat = 'caf' | 'ogg' | 'm4a';

function ffmpegArgsFor(format: EncodeFormat, inPath: string, outPath: string): string[] {
  switch (format) {
    case 'caf':
      // Uncompressed 16-bit PCM in a Core Audio Format container — what iOS expects for short SFX.
      return ['-y', '-i', inPath, '-c:a', 'pcm_s16le', '-ar', '48000', outPath];
    case 'ogg':
      // Ogg Opus (not Vorbis): this ffmpeg build has no libvorbis, and Opus is the better codec for
      // short interface sounds anyway (lower latency, good quality at low bitrate); Android's
      // MediaExtractor/ExoPlayer both play Ogg-encapsulated Opus natively.
      return ['-y', '-i', inPath, '-c:a', 'libopus', '-b:a', '96k', outPath];
    case 'm4a':
      return ['-y', '-i', inPath, '-c:a', 'aac', '-b:a', '192k', outPath];
    default:
      throw new Error(`sound-art bake: unknown encode format "${String(format)}"`);
  }
}

/** Encodes PCM to the given format via ffmpeg, through a temporary intermediate WAV file. */
export function encodeToFile(
  pcm: Float32Array,
  sampleRate: number,
  format: EncodeFormat,
  outPath: string,
): void {
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'sound-art-bake-'));
  const wavPath = path.join(tmpDir, 'source.wav');
  try {
    writeFileSync(wavPath, encodeWav(pcm, sampleRate));
    const result = spawnSync('ffmpeg', ffmpegArgsFor(format, wavPath, outPath), {
      encoding: 'utf-8',
    });
    if (result.status !== 0) {
      throw new Error(`ffmpeg failed encoding ${outPath} (format ${format}):\n${result.stderr}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
