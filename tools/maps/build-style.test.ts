import { describe, expect, it } from 'vitest';

import { buildCritterpassDarkStyle, validateCritterpassDarkStyle } from './build-style';

describe('buildCritterpassDarkStyle', () => {
  it('validates against the real MapLibre style spec', () => {
    const style = buildCritterpassDarkStyle();
    expect(() => validateCritterpassDarkStyle(style)).not.toThrow();
  });

  it('declares both the world (Protomaps Basemap schema) and region (OpenMapTiles schema) sources', () => {
    const style = buildCritterpassDarkStyle();
    expect(style.sources['world']?.type).toBe('vector');
    expect(style.sources['region']?.type).toBe('vector');
  });

  it('points glyphs and sprite at the public R2 bucket', () => {
    const style = buildCritterpassDarkStyle();
    expect(style.glyphs).toContain('r2.dev/fonts/{fontstack}/{range}.pbf');
    expect(style.sprite).toContain('r2.dev/sprite/sprite');
  });

  it('rejects a style with an invalid layer reference', () => {
    const style = buildCritterpassDarkStyle();
    const broken = {
      ...style,
      layers: [...style.layers, { id: 'broken', type: 'not-a-real-type' }],
    };
    expect(() => validateCritterpassDarkStyle(broken as never)).toThrow();
  });
});
