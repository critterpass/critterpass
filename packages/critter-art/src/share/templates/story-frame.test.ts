import { describe, expect, it } from 'vitest';

import { buildRecapCoverStory } from './recap-cover';
import { assertStorySize, buildStoryFrameLayers } from './story-frame';

describe('assertStorySize', () => {
  it('accepts a 1080x1920 layout', () => {
    const layout = buildRecapCoverStory({
      tripName: 'Trip',
      dateRange: 'range',
      heroKind: 'gecko',
      heroSeed: 7,
    });
    expect(() => assertStorySize(layout)).not.toThrow();
  });

  it('rejects a post-sized layout', () => {
    expect(() => assertStorySize({ width: 1080, height: 1350, nodes: [] })).toThrow(/1080x1920/);
  });
});

describe('buildStoryFrameLayers', () => {
  it('packages a background and sticker image into Instagram Stories’ two-layer payload', () => {
    const background = new Uint8Array([1, 2, 3]);
    const sticker = new Uint8Array([4, 5]);
    const layers = buildStoryFrameLayers({
      backgroundPngBytes: background,
      stickerPngBytes: sticker,
      stickerX: 100,
      stickerY: 200,
      stickerWidth: 300,
      stickerHeight: 300,
    });
    expect(layers.backgroundImage).toBe(background);
    expect(layers.stickerImage).toBe(sticker);
    expect(layers).toMatchObject({
      stickerX: 100,
      stickerY: 200,
      stickerWidth: 300,
      stickerHeight: 300,
    });
  });
});
