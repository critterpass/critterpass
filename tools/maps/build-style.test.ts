import { createExpression, type ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import {
  buildCritterpassDarkStyle,
  handDrawnFont,
  validateCritterpassDarkStyle,
} from './build-style';

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

  it('names only fontstacks whose glyph ranges are on the bucket', () => {
    const named = JSON.stringify(buildCritterpassDarkStyle()).match(/[\w-]+ Regular/g) ?? [];
    expect([...new Set(named)].sort()).toEqual([
      'Archivo-W100-700 Regular',
      'Borel-400 Regular',
      'Caveat-600 Regular',
    ]);
  });

  it('picks the hand-drawn font per label: Caveat for macron vowels, Borel otherwise', () => {
    const style = buildCritterpassDarkStyle();
    const fontFor = (layerId: string, properties: Record<string, string>): unknown => {
      const layer = style.layers.find((candidate) => candidate.id === layerId);
      if (layer?.type !== 'symbol') throw new Error(`${layerId} is not a symbol layer`);
      const font = layer.layout?.['text-font'];
      expect(font).toEqual(handDrawnFont(layer.layout?.['text-field'] as ExpressionSpecification));
      const parsed = createExpression(font, `layers.${layerId}.layout.text-font`);
      if (parsed.result !== 'success') throw new Error('text-font expression did not parse');
      return parsed.value.evaluate({ zoom: 10 }, { type: 1, properties });
    };

    expect(fontFor('region-place-city', { name: 'Đà Nẵng' })).toEqual(['Borel-400 Regular']);
    expect(fontFor('region-place-city', { 'name:latin': 'Ōtsu', name: '大津市' })).toEqual([
      'Caveat-600 Regular',
    ]);
    expect(fontFor('world-places', { name: 'Kyōto' })).toEqual(['Caveat-600 Regular']);
    expect(fontFor('world-places', { name: 'Hội An' })).toEqual(['Borel-400 Regular']);
    expect(fontFor('world-places', {})).toEqual(['Borel-400 Regular']);
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
