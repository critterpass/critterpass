import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assemble,
  ffmpegArgs,
  posterSecond,
  PREVIEW_SPECS,
  probe,
  timeline,
  videoIssues,
  type Clip,
} from './preview-video';

const spec = PREVIEW_SPECS['app-store'];
const clip = (file: string, duration: number): Clip => ({ file, start: 1, duration });
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

describe('store preview video', () => {
  it('keeps the cut inside the length the store takes', () => {
    const slots = timeline([clip('a.mp4', 8), clip('b.mp4', 10)], spec);
    expect(slots).toEqual([
      { from: 0, to: 8 },
      { from: 8, to: 18 },
    ]);
    expect(posterSecond(slots)).toBe(4);
    expect(() => timeline([clip('a.mp4', 9)], spec)).toThrow(/takes 15 to 30 s/u);
    expect(() => timeline([clip('a.mp4', 20), clip('b.mp4', 11)], spec)).toThrow(/31 s/u);
  });

  it('trims, fits and joins the clips, then lays each caption over its own clip', () => {
    const clips = [clip('a.mp4', 8), clip('b.mp4', 10)];
    const args = ffmpegArgs(clips, [{ file: 'cap.png', slot: { from: 8, to: 18 } }], spec, 'o.mp4');
    const graph = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(graph).toContain('[c0][c1]concat=n=2:v=1:a=0[v0]');
    expect(graph).toContain("[v0][2:v]overlay=enable='between(t,8,18)'[v1]");
    expect(graph).toContain('scale=886:1920:force_original_aspect_ratio=decrease');
    expect(args[args.indexOf('-map') + 1]).toBe('[v1]');
    expect(args).toContain('-an');
  });

  it('names what the store would refuse in a finished video', () => {
    const stream = { codec_type: 'video', codec_name: 'h264', width: 886, height: 1920 };
    const good = { streams: [{ ...stream, avg_frame_rate: '30/1' }], format: { duration: '24.0' } };
    expect(videoIssues(good, spec)).toEqual([]);
    expect(
      videoIssues(
        {
          streams: [{ ...stream, width: 1080, codec_name: 'hevc', avg_frame_rate: '60/1' }],
          format: { duration: '34.2' },
        },
        spec,
      ),
    ).toEqual([
      '1080x1920, needs 886x1920',
      'codec hevc, needs h264',
      '60.00 fps, at most 30',
      '34.2 s long, needs 15 to 30 s',
    ]);
    expect(videoIssues({ streams: [{ codec_type: 'audio' }] }, spec)).toEqual(['no video stream']);
  });

  it.skipIf(!hasFfmpeg)(
    'cuts two recordings into a captioned preview the store rules accept',
    { timeout: 180_000 },
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'store-preview-test-'));
      // Stand-in recordings at a phone's proportions (ffmpeg's own test pattern).
      const recordings = ['a.mp4', 'b.mp4'].map((name) => {
        const file = path.join(dir, name);
        execFileSync('ffmpeg', [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=540x1170:rate=30:duration=12',
          '-pix_fmt',
          'yuv420p',
          file,
        ]);
        return file;
      });
      const clips: Clip[] = [
        { file: recordings[0]!, start: 1, duration: 8, caption: { vi: 'Bình chọn nơi sẽ đến' } },
        { file: recordings[1]!, start: 2, duration: 9 },
      ];
      const made = await assemble({ clips, store: 'app-store', locale: 'vi', outDir: dir });
      expect(videoIssues(probe(made.video), spec)).toEqual([]);
      expect(existsSync(made.poster)).toBe(true);
    },
  );
});
