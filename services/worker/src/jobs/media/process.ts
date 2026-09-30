/**
 * Turns a downloaded stock file into what the app loads: WebP stills in the widths the heroes use
 * (never upscaled), a blurhash and the dominant colour, and for a video an 8-second muted H.264
 * loop per width (faststart, so it plays while it downloads) with its first frame as the poster.
 * ffmpeg runs as a child process on temporary files that are removed afterwards.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { encodeBlurhash } from '@cp/domain';
import sharp from 'sharp';

const run = promisify(execFile);

export const STILL_WIDTHS = [480, 828, 1242, 1656] as const;
export const LOOP_WIDTHS = [720, 1280] as const;
export const LOOP_SECONDS = 8;

export interface EncodedFile {
  readonly w: number;
  readonly h: number;
  readonly bytes: Uint8Array;
}

export interface ProcessedStill {
  readonly width: number;
  readonly height: number;
  readonly stills: readonly EncodedFile[];
  readonly blurhash: string;
  readonly colour: string;
}

export interface ProcessedVideo extends ProcessedStill {
  readonly loops: readonly EncodedFile[];
  readonly durationMs: number;
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** Widths to encode for a source `width` wide: every standard width it covers, at least one. */
export function widthsFor(width: number, standard: readonly number[]): number[] {
  const fit = standard.filter((w) => w <= width);
  return fit.length > 0 ? fit : [Math.min(width, standard[0] ?? width)];
}

export async function processStill(input: Uint8Array): Promise<ProcessedStill> {
  const base = sharp(input, { failOn: 'error' }).rotate();
  const { data, info } = await base
    .clone()
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  const { dominant } = await base.clone().stats();
  const meta = await base.clone().metadata();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (width === 0 || height === 0) throw new Error('image has no size');
  const stills: EncodedFile[] = [];
  for (const w of widthsFor(width, STILL_WIDTHS)) {
    const { data: webp, info: out } = await base
      .clone()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 78, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    stills.push({ w: out.width, h: out.height, bytes: new Uint8Array(webp) });
  }
  return {
    width,
    height,
    stills,
    blurhash,
    colour: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
  };
}

async function probeSeconds(ffprobe: string, file: string): Promise<number> {
  const { stdout } = await run(ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('video has no duration');
  return seconds;
}

export async function processVideo(
  input: Uint8Array,
  tools: { readonly ffmpeg?: string; readonly ffprobe?: string } = {},
): Promise<ProcessedVideo> {
  const ffmpeg = tools.ffmpeg ?? 'ffmpeg';
  const dir = await mkdtemp(path.join(tmpdir(), 'cp-media-'));
  try {
    const source = path.join(dir, 'in');
    await writeFile(source, input);
    const seconds = await probeSeconds(tools.ffprobe ?? 'ffprobe', source);
    // Skip the first second (fades and shaky starts) when the clip is long enough.
    const start = seconds > LOOP_SECONDS + 2 ? 1 : 0;
    const length = Math.min(LOOP_SECONDS, seconds - start);
    const poster = path.join(dir, 'poster.png');
    await run(ffmpeg, [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-ss',
      String(start),
      '-i',
      source,
      '-frames:v',
      '1',
      poster,
    ]);
    const still = await processStill(new Uint8Array(await readFile(poster)));
    const loops: EncodedFile[] = [];
    for (const w of widthsFor(still.width, LOOP_WIDTHS)) {
      const out = path.join(dir, `${w}.mp4`);
      await run(ffmpeg, [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-ss',
        String(start),
        '-t',
        String(length),
        '-i',
        source,
        '-an',
        '-vf',
        `scale=${w}:-2,fps=30`,
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'slow',
        '-crf',
        w > 1000 ? '26' : '27',
        '-maxrate',
        w > 1000 ? '2400k' : '1200k',
        '-bufsize',
        w > 1000 ? '4800k' : '2400k',
        '-movflags',
        '+faststart',
        out,
      ]);
      const bytes = new Uint8Array(await readFile(out));
      loops.push({ w, h: Math.round((still.height * w) / still.width / 2) * 2, bytes });
    }
    return { ...still, loops, durationMs: Math.round(length * 1000) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
