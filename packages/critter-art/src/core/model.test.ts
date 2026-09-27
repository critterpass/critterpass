import { beforeAll, describe, expect, it } from 'vitest';

import { loadDesignDoodleKit } from './design-doodle-kit-reference';
import { build } from './model';
import type { KindDrawOptions } from '../kinds/registry';
import { registerKind } from '../kinds/registry';
import type { OpSink } from './ops';

const TEST_KIND = 'model-test-square';
const TEST_KIND_UNSTICKERED = 'model-test-square-plain';

/** Small hand-written kind covering every op type, used to exercise `build` mechanics directly. */
function testKind(sink: OpSink, options: KindDrawOptions): void {
  sink.wash(
    [
      [20, 20],
      [80, 20],
      [80, 80],
      [20, 80],
    ],
    options.fill ?? '#a9d08c',
  );
  sink.stroke(
    [
      [10, 50],
      [50, 10],
      [90, 50],
    ],
    options.spot ?? '#6f9f5a',
    4,
  );
  sink.fill(
    [
      [40, 40],
      [60, 40],
      [50, 60],
    ],
    options.accent ?? '#ff7fa8',
  );
  if (options.closed) {
    sink.line(
      [
        [30, 30],
        [50, 45],
        [70, 30],
      ],
      { w: 2.5 },
    );
  } else {
    sink.line(
      [
        [10, 90],
        [50, 60],
        [90, 90],
      ],
      { w: 2.5, taper: true },
    );
  }
  sink.dot(50, 50, 3, options.eye);
}

beforeAll(() => {
  registerKind(TEST_KIND, { fn: testKind, viewBox: [100, 100], animates: true });
  registerKind(TEST_KIND_UNSTICKERED, { fn: testKind, viewBox: [100, 100], animates: true });
  const { K } = loadDesignDoodleKit();
  const gecko = K['gecko'];
  if (!gecko) throw new Error('design/doodles.js no longer exports K.gecko');
  registerKind('model-test-gecko', { fn: gecko, viewBox: [100, 100], animates: true });
});

describe('build', () => {
  it('produces one built op per authored op, preserving order', () => {
    const model = build({ kind: TEST_KIND_UNSTICKERED, seed: 7 }, 96);
    expect(model.ops.map((op) => op.t)).toEqual(['wash', 'under', 'fill', 'line', 'fill']);
  });

  it('matches the design instrumentation for gecko: 42 ops, 1121 tessellated points', () => {
    const model = build({ kind: 'model-test-gecko', seed: 7 }, 96);
    expect(model.ops).toHaveLength(42);
    const totalPoints = model.ops.reduce((sum, op) => sum + op.points.length, 0);
    expect(totalPoints).toBe(1121);
    const byType = model.ops.reduce<Record<string, number>>((counts, op) => {
      counts[op.t] = (counts[op.t] ?? 0) + 1;
      return counts;
    }, {});
    expect(byType).toEqual({ line: 11, under: 7, wash: 2, fill: 22 });
  });

  it('precomputes full ribbon L/R arrays sized to each line/under op', () => {
    const model = build({ kind: TEST_KIND_UNSTICKERED, seed: 7 }, 96);
    const under = model.ops.find((op) => op.t === 'under');
    const line = model.ops.find((op) => op.t === 'line');
    expect(under?.t === 'under' && under.ribbon.left.length).toBe(under?.points.length);
    expect(line?.t === 'line' && line.ribbon.left.length).toBe(line?.points.length);
  });

  it('builds a sticker outline shape per op: stroke+fill for wash/fill, stroke-only for line/under', () => {
    const model = build({ kind: TEST_KIND, seed: 7, sticker: { color: '#f4efe4' } }, 96);
    expect(model.stickerColor).toBe('#f4efe4');
    expect(model.stickerOutline).toHaveLength(5);
    expect(model.stickerOutline?.map((shape) => shape.fill)).toEqual([true, false, true, false, true]);
  });

  it('omits the sticker outline when no sticker is requested', () => {
    const model = build({ kind: TEST_KIND_UNSTICKERED, seed: 7 }, 96);
    expect(model.stickerOutline).toBeNull();
    expect(model.stickerColor).toBeNull();
  });

  it('recolours every op to the mask colour at full opacity and forces source-over', () => {
    const model = build(
      { kind: TEST_KIND_UNSTICKERED, seed: 7, variant: 'mask', maskColor: '#3a3466' },
      96,
    );
    expect(model.blend).toBe('srcOver');
    for (const op of model.ops) {
      expect(op.color).toBe('#3a3466');
      if (op.t === 'wash' || op.t === 'fill') expect(op.alpha).toBe(1);
    }
  });

  it('defaults the mask colour to the design silhouette grey when none is given', () => {
    const model = build({ kind: TEST_KIND_UNSTICKERED, seed: 7, variant: 'mask' }, 96);
    expect(model.ops.every((op) => op.color === '#3a3466')).toBe(true);
  });

  it('a form pose overrides a caller-requested pose (epic always shows its pose)', () => {
    let seenPose: string | undefined;
    registerKind('model-test-pose', {
      fn: (_sink, options) => {
        seenPose = options.pose;
      },
      viewBox: [100, 100],
      animates: false,
    });
    build(
      {
        kind: 'model-test-pose',
        seed: 1,
        pose: 'wave',
        form: { rarity: 'epic', palette: { f: '#fff', dk: '#000', bl: '#000' }, pose: 'cheer', edge: 'epic' },
      },
      96,
    );
    expect(seenPose).toBe('cheer');
  });

  it('throws for an unregistered kind', () => {
    expect(() => build({ kind: 'not-a-real-kind', seed: 1 }, 96)).toThrow(/unknown critter-art kind/);
  });

  it('tilt/hop move every op point, including the sticker outline (built from the same transformed ops)', () => {
    const plain = build({ kind: TEST_KIND, seed: 7, sticker: { color: '#f4efe4' } }, 96);
    const tilted = build({ kind: TEST_KIND, seed: 7, sticker: { color: '#f4efe4' }, pose: 'tilt' }, 96);
    const hopped = build({ kind: TEST_KIND, seed: 7, sticker: { color: '#f4efe4' }, pose: 'hop' }, 96);
    for (const posed of [tilted, hopped]) {
      expect(posed.ops.map((op) => op.points)).not.toEqual(plain.ops.map((op) => op.points));
      expect(posed.stickerOutline?.map((shape) => shape.points)).not.toEqual(
        plain.stickerOutline?.map((shape) => shape.points),
      );
    }
  });

  it('an unposed or cheer-posed kind is untouched by the tilt/hop transform', () => {
    const idle = build({ kind: TEST_KIND_UNSTICKERED, seed: 7 }, 96);
    const cheer = build({ kind: TEST_KIND_UNSTICKERED, seed: 7, pose: 'cheer' }, 96);
    expect(cheer.ops.map((op) => op.points)).toEqual(idle.ops.map((op) => op.points));
  });
});
