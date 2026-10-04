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

  it('draws every label in a fontstack that has Vietnamese glyph ranges on the bucket', () => {
    const fonts = buildCritterpassDarkStyle().layers.flatMap((layer) => {
      const font = layer.type === 'symbol' ? layer.layout?.['text-font'] : undefined;
      return font === undefined ? [] : [font];
    });
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect([['Archivo-W100-700 Regular'], ['Borel-400 Regular']]).toContainEqual(font);
    }
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
