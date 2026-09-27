import { describe, expect, it } from 'vitest';

import { critters } from '../data/critters';
import { isGuideSpec } from '../data/types';
import {
  artParamsSchema,
  colorTripletSchema,
  edgeStyleSchema,
  formSpecSchema,
  paletteSchema,
  poseSchema,
} from './schema';

const LOCAL_CRITTERS = critters.filter((c) => !isGuideSpec(c.spec));

describe('artParamsSchema', () => {
  it('parses all 144 local critters shipped in src/data/critters.ts', () => {
    expect(LOCAL_CRITTERS).toHaveLength(144);
    for (const critter of LOCAL_CRITTERS) {
      const result = artParamsSchema.safeParse(critter.spec);
      expect(
        result.success,
        `${critter.id} (${critter.name}) failed: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });

  it('rejects an unknown archetype name', () => {
    expect(
      artParamsSchema.safeParse({ b: 'dragonrider', c: ['#fff', '#000', '#eee'] }).success,
    ).toBe(false);
  });

  it('rejects a colour triplet with the wrong arity', () => {
    expect(artParamsSchema.safeParse({ b: 'sit', c: ['#fff', '#000'] }).success).toBe(false);
  });
});

describe('paletteSchema / poseSchema / edgeStyleSchema / formSpecSchema', () => {
  it('parses a minimal common-form palette (f/dk/bl only)', () => {
    expect(paletteSchema.safeParse({ f: '#fff', dk: '#000', bl: '#eee' }).success).toBe(true);
  });

  it('parses a guide palette using every optional slot', () => {
    const result = paletteSchema.safeParse({
      f: '#54d6a4',
      dk: '#2e9a74',
      bl: '#dff7ea',
      accent: '#ff9a4d',
      leaf: '#54d6a4',
      beak2: '#c99a2a',
      stripe: '#3a3466',
      eye: '#fffdf6',
      pupil: '#221e19',
      ink: '#221e19',
    });
    expect(result.success).toBe(true);
  });

  it('accepts every Pose value including the whole-body tilt/hop poses', () => {
    for (const pose of [
      'idle',
      'wave',
      'cheer',
      'think',
      'point',
      'sleep',
      'crack',
      'tilt',
      'hop',
    ]) {
      expect(poseSchema.safeParse(pose).success).toBe(true);
    }
    expect(poseSchema.safeParse('shrug').success).toBe(false);
  });

  it('accepts every EdgeStyle value', () => {
    for (const edge of ['none', 'epic', 'legendary'])
      expect(edgeStyleSchema.safeParse(edge).success).toBe(true);
    expect(edgeStyleSchema.safeParse('rare').success).toBe(false);
  });

  it('parses a full epic FormSpec', () => {
    const result = formSpecSchema.safeParse({
      rarity: 'epic',
      palette: { f: '#ff9a4d', dk: '#c4623e', bl: '#fff1dc' },
      pose: 'cheer',
      edge: 'epic',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a FormSpec with an unknown edge value', () => {
    expect(
      formSpecSchema.safeParse({
        rarity: 'common',
        palette: { f: '#fff', dk: '#000', bl: '#eee' },
        edge: 'purple',
      }).success,
    ).toBe(false);
  });
});

describe('colorTripletSchema', () => {
  it('accepts a 3-string tuple and rejects other arities', () => {
    expect(colorTripletSchema.safeParse(['#fff', '#000', '#eee']).success).toBe(true);
    expect(colorTripletSchema.safeParse(['#fff', '#000']).success).toBe(false);
    expect(colorTripletSchema.safeParse(['#fff', '#000', '#eee', '#ccc']).success).toBe(false);
  });
});
