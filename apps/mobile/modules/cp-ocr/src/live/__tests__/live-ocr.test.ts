import { describe, expect, it } from '@jest/globals';

import type { OcrResult } from '../../types';
import { createLiveOcr, fixtureFrames, type LiveFrame } from '../live-ocr';

const signals = { blur: 300, glare: 0, curvature: 0, clipped: 0 };

function result(lines: [string, number][]): OcrResult {
  return {
    status: lines.length ? 'ok' : 'no_text',
    lines: lines.map(([text, y], i) => ({
      id: `l${i}`,
      text,
      bbox: [0.1, y, 0.4, 0.04],
      conf: 0.9,
    })),
    signals,
    quality: null,
    width: 1080,
    height: 1920,
  };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 5));
};

describe('live OCR loop', () => {
  it('tracks lines across stills and reports the view stable once they settle', async () => {
    const frames: LiveFrame[] = [];
    const reads: string[] = [];
    const live = createLiveOcr({
      capture: fixtureFrames(['file:///a.jpg', 'file:///b.jpg']),
      recognize: (uri) => {
        reads.push(uri);
        return Promise.resolve(
          result([
            ['Phở bò', 0.2 + reads.length * 0.002],
            ['55.000đ', 0.3 + reads.length * 0.002],
          ]),
        );
      },
      onFrame: (frame) => frames.push(frame),
      fps: 5,
    });
    live.start();
    await until(() => frames.length >= 4);
    live.stop();
    expect(reads.slice(0, 3)).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///a.jpg']);
    expect(new Set(frames.map((f) => f.lines[0]!.id)).size).toBe(1);
    expect(frames[0]!.stable).toBe(false);
    expect(frames[2]!.stable).toBe(true);
  });

  it('reads one still at a time and stops reporting once stopped', async () => {
    let inFlight = 0;
    let most = 0;
    const frames: LiveFrame[] = [];
    const live = createLiveOcr({
      capture: () => Promise.resolve('file:///s.jpg'),
      recognize: async () => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return result([['Bún chả', 0.4]]);
      },
      onFrame: (frame) => frames.push(frame),
      fps: 5,
    });
    live.start();
    live.start();
    await until(() => frames.length >= 2);
    live.stop();
    const count = frames.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(most).toBe(1);
    expect(frames.length).toBe(count);
  });

  it('keeps going after a failed still', async () => {
    const errors: unknown[] = [];
    const frames: LiveFrame[] = [];
    let calls = 0;
    const live = createLiveOcr({
      capture: () => Promise.resolve('file:///s.jpg'),
      recognize: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('busy')) : Promise.resolve(result([]));
      },
      onFrame: (frame) => frames.push(frame),
      onError: (error) => errors.push(error),
      fps: 5,
    });
    live.start();
    await until(() => frames.length >= 1);
    live.stop();
    expect(errors).toHaveLength(1);
    expect(frames[0]!.status).toBe('no_text');
    expect(frames[0]!.stable).toBe(false);
  });
});
