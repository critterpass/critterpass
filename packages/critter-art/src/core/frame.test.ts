import { beforeAll, describe, expect, it } from 'vitest';

import type { Cmd, LayerCmd, PolyCmd } from './cmd';
import { frame } from './frame';
import { build } from './model';
import type { KindDrawOptions } from '../kinds/registry';
import { registerKind } from '../kinds/registry';
import type { OpSink } from './ops';

const WASH_FILL_LINE_KIND = 'frame-test-wash-fill-line';
const TWO_LINES_KIND = 'frame-test-two-lines';

function washFillLineKind(sink: OpSink, options: KindDrawOptions): void {
  sink.wash(
    [
      [10, 10],
      [90, 10],
      [90, 90],
      [10, 90],
    ],
    options.fill ?? '#a9d08c',
  );
  sink.fill(
    [
      [40, 40],
      [60, 40],
      [50, 60],
    ],
    options.accent ?? '#ff7fa8',
  );
  sink.line(
    [
      [10, 50],
      [50, 10],
      [90, 50],
    ],
    { w: 3 },
  );
}

function twoLinesKind(sink: OpSink): void {
  sink.line(
    [
      [10, 50],
      [90, 50],
    ],
    { w: 3, taper: false },
  );
  sink.line(
    [
      [10, 80],
      [90, 80],
    ],
    { w: 3, taper: false },
  );
}

beforeAll(() => {
  registerKind(WASH_FILL_LINE_KIND, { fn: washFillLineKind, viewBox: [100, 100], animates: true });
  registerKind(TWO_LINES_KIND, { fn: twoLinesKind, viewBox: [100, 100], animates: false });
});

function asLayer(cmd: Cmd): LayerCmd {
  if (cmd.t !== 'layer') throw new Error(`expected a layer cmd, got "${cmd.t}"`);
  return cmd;
}

function asPoly(cmd: Cmd): PolyCmd {
  if (cmd.t !== 'poly') throw new Error(`expected a poly cmd, got "${cmd.t}"`);
  return cmd;
}

describe('frame', () => {
  it('draws nothing at or before p=0', () => {
    const model = build({ kind: WASH_FILL_LINE_KIND, seed: 7 }, 96);
    expect(frame(model, 0)).toEqual([]);
    expect(frame(model, -0.2)).toEqual([]);
  });

  it('wraps everything in one isolated outer layer with no sticker sub-layer when unstickered', () => {
    const model = build({ kind: WASH_FILL_LINE_KIND, seed: 7 }, 96);
    const cmds = frame(model, 1);
    expect(cmds).toHaveLength(1);
    const outer = asLayer(cmds[0]!);
    expect(outer.isolate).toBe(true);
    expect(outer.shadow).toBeUndefined();
    // wash fill + wash edge stroke + fill + line = 4 body cmds, no sticker sub-layer.
    expect(outer.cmds).toHaveLength(4);
    expect(outer.cmds.every((c) => c.t !== 'layer')).toBe(true);
  });

  it('nests a shadowed sticker sub-layer, alpha ramping as min(1, 4p)', () => {
    const model = build(
      { kind: WASH_FILL_LINE_KIND, seed: 7, sticker: { color: '#f4efe4' } },
      96,
    );
    const full = asLayer(frame(model, 1)[0]!);
    expect(full.cmds).toHaveLength(5); // sticker sub-layer + 4 body cmds
    const stickerLayer = asLayer(full.cmds[0]!);
    expect(stickerLayer.alpha).toBe(1);
    expect(stickerLayer.shadow).toEqual({ dy: 2.5, sigma: 2.5, color: 'rgba(0,0,0,.32)' });

    const early = asLayer(frame(model, 0.1)[0]!);
    const earlyStickerLayer = asLayer(early.cmds[0]!);
    expect(earlyStickerLayer.alpha).toBeCloseTo(0.4, 10);
  });

  it('fades washes/fills in between p .25 and .8 but never fades a revealed ink line', () => {
    const model = build({ kind: WASH_FILL_LINE_KIND, seed: 7 }, 96);
    const outer = asLayer(frame(model, 0.4)[0]!);
    const [washFill, , fillCmd, lineCmd] = outer.cmds;
    const expectedFade = (0.4 - 0.25) / 0.55;
    expect(asPoly(washFill!).alpha).toBeCloseTo(0.9 * expectedFade, 10);
    expect(asPoly(fillCmd!).alpha).toBeCloseTo(expectedFade, 10);
    expect(asPoly(lineCmd!).alpha).toBe(1);
  });

  it('truncates a revealed line to a prefix of its precomputed ribbon (no re-tessellation)', () => {
    const model = build({ kind: WASH_FILL_LINE_KIND, seed: 7 }, 96);
    const lineOp = model.ops.find((op) => op.t === 'line');
    if (lineOp?.t !== 'line') throw new Error('expected the kind to build a line op');
    const fullPointCount = lineOp.ribbon.left.length;

    const outerPartial = asLayer(frame(model, 0.4)[0]!);
    const partialLine = asPoly(outerPartial.cmds.at(-1)!);
    const outerFull = asLayer(frame(model, 1)[0]!);
    const fullLine = asPoly(outerFull.cmds.at(-1)!);

    expect(partialLine.pts.length).toBeLessThan(fullLine.pts.length);
    // ribbonOutline concatenates left+right (2*fullPointCount points), flattened to x,y pairs.
    expect(fullLine.pts.length).toBe(fullPointCount * 4);
  });

  it('reveals ops sequentially by arc-length budget: a later op can be fully skipped', () => {
    const model = build({ kind: TWO_LINES_KIND, seed: 3 }, 96);
    const [first, second] = model.ops;
    if (first?.t !== 'line' || second?.t !== 'line') throw new Error('expected two line ops');
    expect(first.arcLength).toBeCloseTo(second.arcLength, 6);

    // Budget covers well under the first op's full length, so the second never starts.
    const p = (0.4 * first.arcLength) / (model.totalArcLength * 1.02);
    const outer = asLayer(frame(model, p)[0]!);
    expect(outer.cmds).toHaveLength(1);
    const revealed = asPoly(outer.cmds[0]!);
    expect(revealed.pts.length).toBeLessThan(first.ribbon.left.length * 2);
  });
});
