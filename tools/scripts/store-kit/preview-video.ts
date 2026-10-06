/**
 * App Store preview and Google Play promo videos, cut from screen recordings of the running app
 * (the device run's recordings of the store-shot flows). Clips are trimmed, scaled into the
 * store's frame, joined, and each clip's caption is laid over it; a poster frame is saved beside
 * the video.
 *
 *   pnpm tsx tools/scripts/store-kit/preview-video.ts --clips <clips.json> --store app-store
 *       [--locale en] [--out <dir>]
 *   pnpm tsx tools/scripts/store-kit/preview-video.ts --check <video> --store app-store
 *
 * `clips.json`: `[{"file": "vote.mp4", "start": 2, "duration": 5, "caption": {"en": "…"}}]`, with
 * files relative to it. `--check` reads the file with ffprobe and fails on anything the store
 * would refuse.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { card, rect, text } from '../../../packages/critter-art/src/share/layout';
import { STORE_OUT } from './capture';
import { fitText, type MeasureAt } from './fit-text';
import { HEADLINE_FONT, measurer, renderLayoutPng } from './render';

export interface PreviewSpec {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

/** App Store: portrait 886x1920, 15 to 30 s, at most 30 fps. Play's promo reuses the cut at 9:16. */
export const PREVIEW_SPECS: Readonly<Record<'app-store' | 'play', PreviewSpec>> = {
  'app-store': { width: 886, height: 1920, fps: 30, minSeconds: 15, maxSeconds: 30 },
  play: { width: 1080, height: 1920, fps: 30, minSeconds: 15, maxSeconds: 30 },
};

export const clipsSchema = z
  .array(
    z.strictObject({
      file: z.string().min(1),
      /** Seconds into the recording where the clip starts. */
      start: z.number().min(0),
      duration: z.number().positive(),
      caption: z.record(z.string(), z.string().trim().min(1).max(40)).optional(),
    }),
  )
  .min(1);
export type Clip = z.infer<typeof clipsSchema>[number];

export interface Slot {
  readonly from: number;
  readonly to: number;
}

/** When each clip plays in the cut; throws when the cut is outside the store's length. */
export function timeline(clips: readonly Clip[], spec: PreviewSpec): Slot[] {
  let at = 0;
  const slots = clips.map((clip) => ({ from: at, to: (at += clip.duration) }));
  if (at < spec.minSeconds || at > spec.maxSeconds) {
    throw new Error(
      `the cut is ${String(at)} s: the store takes ${String(spec.minSeconds)} to ${String(spec.maxSeconds)} s`,
    );
  }
  return slots;
}

/** The poster frame: the middle of the first clip, clear of any fade at the join. */
export function posterSecond(slots: readonly Slot[]): number {
  const [first] = slots;
  return first === undefined ? 0 : (first.from + first.to) / 2;
}

export interface Overlay {
  /** A transparent PNG the size of the frame. */
  readonly file: string;
  readonly slot: Slot;
}

/** ffmpeg arguments for the cut: every clip trimmed and fitted, joined, overlays on top, no audio. */
export function ffmpegArgs(
  clips: readonly Clip[],
  overlays: readonly Overlay[],
  spec: PreviewSpec,
  out: string,
): string[] {
  const size = `${String(spec.width)}:${String(spec.height)}`;
  const inputs = [
    ...clips.flatMap((clip) => [
      '-ss',
      String(clip.start),
      '-t',
      String(clip.duration),
      '-i',
      clip.file,
    ]),
    ...overlays.flatMap((overlay) => ['-i', overlay.file]),
  ];
  const fitted = clips.map(
    (_clip, index) =>
      `[${String(index)}:v]scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${String(spec.fps)}[c${String(index)}]`,
  );
  const joined = `${clips.map((_clip, index) => `[c${String(index)}]`).join('')}concat=n=${String(clips.length)}:v=1:a=0[v0]`;
  const laid = overlays.map(
    (overlay, index) =>
      `[v${String(index)}][${String(clips.length + index)}:v]overlay=enable='between(t,${String(overlay.slot.from)},${String(overlay.slot.to)})'[v${String(index + 1)}]`,
  );
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    [...fitted, joined, ...laid].join(';'),
    '-map',
    `[v${String(overlays.length)}]`,
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(spec.fps),
    '-movflags',
    '+faststart',
    out,
  ];
}

interface Probe {
  readonly streams?: readonly {
    readonly codec_type?: string;
    readonly codec_name?: string;
    readonly width?: number;
    readonly height?: number;
    readonly avg_frame_rate?: string;
  }[];
  readonly format?: { readonly duration?: string };
}

/** What a store would refuse about a video, from its ffprobe report; empty when it can ship. */
export function videoIssues(probe: Probe, spec: PreviewSpec): string[] {
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (video === undefined) return ['no video stream'];
  const issues: string[] = [];
  if (video.width !== spec.width || video.height !== spec.height) {
    issues.push(
      `${String(video.width)}x${String(video.height)}, needs ${String(spec.width)}x${String(spec.height)}`,
    );
  }
  if (video.codec_name !== 'h264') issues.push(`codec ${String(video.codec_name)}, needs h264`);
  const [frames = 0, per = 1] = (video.avg_frame_rate ?? '0/1').split('/').map(Number);
  const fps = per === 0 ? 0 : frames / per;
  if (fps <= 0 || fps > spec.fps + 0.01)
    issues.push(`${fps.toFixed(2)} fps, at most ${String(spec.fps)}`);
  const seconds = Number(probe.format?.duration ?? 'NaN');
  if (!(seconds >= spec.minSeconds && seconds <= spec.maxSeconds + 0.05)) {
    issues.push(
      `${seconds.toFixed(1)} s long, needs ${String(spec.minSeconds)} to ${String(spec.maxSeconds)} s`,
    );
  }
  return issues;
}

export function probe(file: string): Probe {
  const out = execFileSync('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ]);
  return JSON.parse(out.toString('utf8')) as Probe;
}

/** A caption band over the lower part of the frame, as a transparent PNG the size of the frame. */
export async function captionOverlay(
  caption: string,
  spec: PreviewSpec,
  measure: MeasureAt,
): Promise<Uint8Array> {
  const s = spec.width / 360;
  const margin = 24 * s;
  const fitted = fitText(caption.toUpperCase(), measure, {
    maxWidth: spec.width - 4 * margin,
    maxLines: 2,
    sizes: [30, 26, 22].map((size) => Math.round(size * s)),
  });
  const bandHeight = fitted.lines.length * fitted.fontSize + 2 * margin;
  const top = spec.height - bandHeight - 3 * margin;
  return renderLayoutPng(
    card(
      spec.width,
      spec.height,
      [
        rect(margin, top, spec.width - 2 * margin, bandHeight, '#ffd84a', { radius: 14 * s }),
        text(
          2 * margin,
          top + margin,
          spec.width - 4 * margin,
          caption.toUpperCase(),
          {
            fontFamily: HEADLINE_FONT.family,
            fontWeight: HEADLINE_FONT.weight,
            fontSize: fitted.fontSize,
            color: '#17142a',
          },
          { maxLines: 2, lineHeight: fitted.fontSize },
        ),
      ],
      'rgba(0,0,0,0)',
    ),
  );
}

export interface Assembled {
  readonly video: string;
  readonly poster: string;
}

/** Cuts the video and its poster frame into `outDir`, then checks the result as the store would. */
export async function assemble(args: {
  readonly clips: readonly Clip[];
  readonly store: keyof typeof PREVIEW_SPECS;
  readonly locale: string;
  readonly outDir: string;
}): Promise<Assembled> {
  const spec = PREVIEW_SPECS[args.store];
  const slots = timeline(args.clips, spec);
  const work = mkdtempSync(path.join(tmpdir(), 'store-preview-'));
  const measure = measurer(HEADLINE_FONT);
  const overlays: Overlay[] = [];
  for (const [index, clip] of args.clips.entries()) {
    const caption = clip.caption?.[args.locale];
    const slot = slots[index];
    if (caption === undefined || slot === undefined) continue;
    const file = path.join(work, `caption-${String(index)}.png`);
    writeFileSync(file, await captionOverlay(caption, spec, measure));
    overlays.push({ file, slot });
  }
  mkdirSync(args.outDir, { recursive: true });
  const video = path.join(args.outDir, `preview-${args.locale}.mp4`);
  const poster = path.join(args.outDir, `preview-${args.locale}-poster.png`);
  execFileSync('ffmpeg', ffmpegArgs(args.clips, overlays, spec, video), { stdio: 'inherit' });
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(posterSecond(slots)),
      '-i',
      video,
      '-frames:v',
      '1',
      poster,
    ],
    { stdio: 'inherit' },
  );
  const issues = videoIssues(probe(video), spec);
  if (issues.length > 0) throw new Error(`${video}:\n- ${issues.join('\n- ')}`);
  return { video, poster };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      clips: { type: 'string' },
      check: { type: 'string' },
      store: { type: 'string', default: 'app-store' },
      locale: { type: 'string', default: 'en' },
      out: { type: 'string', default: STORE_OUT },
    },
  });
  const store = (['app-store', 'play'] as const).find((candidate) => candidate === values.store);
  if (store === undefined) throw new Error('--store must be app-store or play');
  if (values.check !== undefined) {
    const issues = videoIssues(probe(values.check), PREVIEW_SPECS[store]);
    if (issues.length > 0) throw new Error(`${values.check}:\n- ${issues.join('\n- ')}`);
    console.log(`${values.check} meets the ${store} preview rules`);
    return;
  }
  if (values.clips === undefined)
    throw new Error('usage: preview-video.ts --clips <json> | --check <video>');
  const base = path.dirname(path.resolve(values.clips));
  const clips = clipsSchema
    .parse(JSON.parse(readFileSync(values.clips, 'utf8')))
    .map((clip) => ({ ...clip, file: path.resolve(base, clip.file) }));
  const made = await assemble({
    clips,
    store,
    locale: values.locale,
    outDir: path.join(values.out, store, 'preview'),
  });
  console.log(`wrote ${made.video} and ${made.poster}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
