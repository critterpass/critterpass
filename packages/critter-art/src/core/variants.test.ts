import { describe, expect, it } from 'vitest';

import { critters } from '../data/critters';
import { EDGE_RING_STYLES } from '../forms/tier-palette';
import { layout } from './layout';
import { build } from './model';
import type { RenderSpec } from './model';
import { applyMaskVariant, applyMonoVariant, applyStampVariant } from './variants';

const BASE: RenderSpec = { kind: 'heart', seed: 7 };
const GUIDE_KINDS = [
  'gecko',
  'tanuki',
  'puffin',
  'axolotl',
  'sardine',
  'alpaca',
  'langur',
] as const;
/** 151 critters (144 locals + 7 guide cp-id aliases) + the 7 guides by their own kind name = 158. */
const ALL_KINDS = [...critters.map((c) => c.id), ...GUIDE_KINDS];

describe('applyMaskVariant', () => {
  it('recolours every op to one colour and forces full opacity on wash/fill', () => {
    const model = build(BASE, 96);
    const masked = applyMaskVariant(model.ops, '#3a3466');
    expect(masked.length).toBe(model.ops.length);
    for (const op of masked) {
      expect(op.color).toBe('#3a3466');
      if (op.t === 'wash' || op.t === 'fill') expect(op.alpha).toBe(1);
    }
  });

  it('covers all 158 kinds (151 critters incl. guide aliases + the 7 guides)', () => {
    expect(ALL_KINDS).toHaveLength(158);
  });

  it.each(ALL_KINDS)('%s has 0 off-palette ops in mask mode', (kind) => {
    const model = build({ kind, seed: 7, variant: 'mask', maskColor: '#3a3466' }, 96);
    const colors = [...new Set(model.ops.map((op) => op.color))];
    expect(colors).toEqual(['#3a3466']);
  });
});

describe('applyMonoVariant', () => {
  it('keeps op count and alpha, recolours to grey scaled by original luminance', () => {
    const model = build(BASE, 96);
    const mono = applyMonoVariant(model.ops);
    expect(mono.length).toBe(model.ops.length);
    for (const op of mono) {
      expect(op.color).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    }
  });

  it('a lighter source colour produces a lighter grey than a darker one', () => {
    const model = build(BASE, 96);
    const lightOps = applyMonoVariant([{ ...model.ops[0]!, color: '#ffffff' }]);
    const darkOps = applyMonoVariant([{ ...model.ops[0]!, color: '#000000' }]);
    const grey = (rgb: string) => Number(rgb.match(/\d+/)?.[0] ?? 0);
    expect(grey(lightOps[0]!.color)).toBeGreaterThan(grey(darkOps[0]!.color));
  });
});

describe('applyStampVariant', () => {
  it('keeps only line ops, recoloured to the given ink', () => {
    const model = build(BASE, 96);
    expect(model.ops.some((op) => op.t !== 'line')).toBe(true);
    const stamped = applyStampVariant(model.ops, '#221e19');
    expect(stamped.length).toBeGreaterThan(0);
    for (const op of stamped) {
      expect(op.t).toBe('line');
      expect(op.color).toBe('#221e19');
    }
  });
});

describe('build() variant wiring', () => {
  it('mono keeps the multiply blend and full op count; stamp forces srcOver and drops non-line ops', () => {
    const color = build(BASE, 96);
    const mono = build({ ...BASE, variant: 'mono' }, 96);
    const stamp = build({ ...BASE, variant: 'stamp' }, 96);
    expect(mono.ops.length).toBe(color.ops.length);
    expect(mono.blend).toBe(color.blend);
    expect(stamp.blend).toBe('srcOver');
    expect(stamp.ops.every((op) => op.t === 'line')).toBe(true);
  });

  it('an epic/legendary form with a sticker builds an edge outline; without a sticker it does not', () => {
    const withSticker = build(
      {
        ...BASE,
        sticker: { color: '#f4efe4' },
        form: { rarity: 'epic', palette: { f: '#fff', dk: '#000', bl: '#eee' }, edge: 'epic' },
      },
      96,
    );
    expect(withSticker.edgeColor).toBe('#ff5fa8');
    expect(withSticker.edgeOutline).not.toBeNull();

    const withoutSticker = build(
      {
        ...BASE,
        form: { rarity: 'epic', palette: { f: '#fff', dk: '#000', bl: '#eee' }, edge: 'epic' },
      },
      96,
    );
    expect(withoutSticker.edgeOutline).toBeNull();

    const commonWithSticker = build(
      {
        ...BASE,
        sticker: { color: '#f4efe4' },
        form: { rarity: 'common', palette: { f: '#fff', dk: '#000', bl: '#eee' }, edge: 'none' },
      },
      96,
    );
    expect(commonWithSticker.edgeColor).toBeNull();
    expect(commonWithSticker.edgeOutline).toBeNull();
  });

  it('keeps the edge ring a fixed point-width across render sizes (matches the CSS drop-shadow px offset it replaces)', () => {
    const spec: RenderSpec = {
      ...BASE,
      sticker: { color: '#f4efe4' },
      form: { rarity: 'epic', palette: { f: '#fff', dk: '#000', bl: '#eee' }, edge: 'epic' },
    };
    for (const sizePt of [24, 96, 300]) {
      const model = build(spec, sizePt);
      const boxLayout = layout(spec, sizePt);
      const stickerFillOp = model.stickerOutline?.find((shape) => shape.fill);
      const edgeFillOp = model.edgeOutline?.find((shape) => shape.fill);
      if (!stickerFillOp || !edgeFillOp) throw new Error('heart has no wash/fill op to measure');
      const ringWidthLocal = (edgeFillOp.width - stickerFillOp.width) / 2;
      expect(ringWidthLocal * boxLayout.scale).toBeCloseTo(EDGE_RING_STYLES.epic.width, 5);
    }
  });
});
