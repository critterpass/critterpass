import type { Point } from '../../../core/geometry';
import { F, W } from '../../../core/ops';
import { blobPolygon, ellipsePolygon, quadraticBezier, tubeOutline } from '../../../core/shapes';
import { drawEars } from '../parts/ears';
import { drawHorns } from '../parts/horns';
import type { HeadFrame } from '../helpers';
import { drawSparkExtras, isEpicPose } from '../poses';
import type { ArchetypeFn } from '../types';
import { drawStandFace } from './stand-face';
import type { StandBodyContext } from './stand-face';

/** Fixed-length lookup with a bounds check, matching `pointAt` but for the plain-number leg x-coordinates. */
function numAt(values: readonly number[], index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError(`index ${index} out of bounds (length ${values.length})`);
  return value;
}

/**
 * design/critters-draw-1.js `X.A.stand`: the four-legged standing archetype, 20 critters across 9
 * named variants plus the plain default. Split at the point the design itself pivots from body
 * geometry to face/pattern detail — `drawStandFace` (stand-face.ts) continues in the same op order.
 */
export const stand: ArchetypeFn = (sink, options, spec, colors) => {
  const v = spec.v ?? '';
  const isGiraffe = v === 'giraffe';
  const isDachshund = v === 'dachshund';
  const isElephant = v === 'elephant';
  const isCamel = v === 'camel';
  const isGuanaco = v === 'guanaco';
  const isHorse = v === 'horse';
  const isMoose = v === 'moose';

  const bx = isDachshund ? 61 : 58;
  const by = isDachshund ? 70 : 63;
  const brx = isDachshund ? 27 : 24;
  const bry = isDachshund ? 10 : 13;
  const bodyExponent = 0.85;
  const epicPose = isEpicPose(options.pose);
  const hx = isDachshund ? 28 : isElephant ? 31 : 30;
  // Epic pose (design gives `stand` no pose of its own): head tips up, as if calling out.
  const hy = (isGiraffe ? 16 : isGuanaco ? 21 : isDachshund ? 53 : isElephant ? 35 : 32) - (epicPose ? 5 : 0);
  const k = isElephant ? 0.8 : 0.7;
  const headFrame: HeadFrame = { x: hx, y: hy, k };
  const hrx = 25 * k * (isElephant ? 1 : 0.9);
  const hry = 18.5 * k * (isElephant ? 1 : 0.95);
  const legBottomY = isDachshund ? 88 : isGiraffe || isGuanaco || isHorse ? 94 : 91;
  const legX = isDachshund ? [42, 49, 73, 80] : [41, 48, 67, 74];
  const bodyRimY = (x: number, sign: number): number =>
    by + sign * bry * Math.max(0, 1 - Math.abs((x - bx) / brx) ** (1 / bodyExponent)) ** bodyExponent;

  const tx = bx + brx - 2;
  const ty = by - bry * 0.45;
  const tailType =
    spec.tail ||
    (isDachshund
      ? 'dog'
      : isHorse || isGiraffe || isCamel || v === 'cow' || v === 'buffalo' || spec.horns === 'straight'
        ? 'tuft'
        : 'short');
  if (isHorse) {
    W(
      sink,
      [
        [tx - 1, ty - 1], [tx + 9, ty + 2], [tx + 13, ty + 14], [tx + 8, ty + 26], [tx + 6, ty + 14], [tx + 1, ty + 7],
      ],
      spec.mc || colors.dk,
      2.1,
    );
  } else if (tailType === 'tuft') {
    sink.line(
      [
        [tx, ty],
        [tx + 7, ty + 7],
        [tx + 8, ty + 17],
      ],
      { w: 2.1 },
    );
    W(sink, ellipsePolygon(tx + 8.5, ty + 19.5, 3.2, 4.4, 10), colors.dk, 1.8);
  } else if (tailType === 'short') {
    W(sink, ellipsePolygon(tx + 2, ty + 1, 4.2, 3.6, 10), colors.bl, 2);
  } else if (tailType === 'dog') {
    const p: Point[] = [
      [tx - 1, ty + 2],
      [tx + 8, ty - 4],
      [tx + 11, ty - 13],
    ];
    sink.stroke(p, colors.f, 5);
    sink.line(p, { w: 2.1 });
  }

  for (const i of [1, 3, 0, 2]) {
    const x = numAt(legX, i);
    const bottom: Point = [x + (i > 1 ? 0.8 : -0.8), legBottomY];
    sink.stroke(
      [
        [x, by],
        bottom,
      ],
      colors.f,
      isElephant ? 9 : isDachshund ? 6 : 7,
    );
    sink.line(
      [
        [x, bodyRimY(x, 1) - 0.5],
        bottom,
      ],
      { w: 2.2, taper: false },
    );
    if (v === 'zebra' || spec.pat === 'zebra') {
      for (const y of [legBottomY - 10, legBottomY - 5]) {
        sink.stroke(
          [
            [x - 3, y],
            [x + 3, y - 1],
          ],
          colors.dk,
          2.2,
        );
      }
    }
    F(sink, ellipsePolygon(bottom[0], legBottomY + 0.8, isElephant ? 5 : 4, 2.1, 8), spec.fc || colors.dk, 1.5);
  }

  if (isCamel) sink.wash(blobPolygon(bx + 3, by - bry + 1, 11, 9, 0.8, 14), colors.f);
  sink.wash(blobPolygon(bx, by, brx, bry, bodyExponent, 16), colors.f);
  const n0: Point = [bx - brx * 0.6, by - bry * 0.4];
  const n2: Point = [hx + 3, hy + hry * 0.6];
  const n1: Point = isGiraffe ? [hx + 9, (n0[1] + n2[1]) / 2] : [(n0[0] + n2[0]) / 2 + 3, (n0[1] + n2[1]) / 2];
  const neckCurve = quadraticBezier(n0, n1, n2, 6);
  const neck = tubeOutline(
    neckCurve,
    isGiraffe || isGuanaco ? 10 : isDachshund ? 13 : isElephant ? 16 : 14,
    isGiraffe || isGuanaco ? 8 : isDachshund ? 12 : isElephant ? 14 : 11,
  );
  if (spec.mane === 'ruff') sink.wash(tubeOutline(neckCurve, 17, 14).polygon, colors.dk);
  sink.wash(neck.polygon, colors.f);
  const maneTube = isHorse ? tubeOutline(neck.right.slice(1).map(([x, y]): Point => [x + 1.6, y - 1]), 7, 5) : null;
  if (maneTube) sink.wash(maneTube.polygon, spec.mc || colors.dk);
  drawEars(sink, spec.ears || (isElephant ? '' : 'horse'), headFrame, colors, spec, 0);
  drawHorns(sink, spec.horns, headFrame, colors, spec);
  if (isElephant) {
    for (const m of [-1, 1]) sink.wash(ellipsePolygon(hx + m * 16, hy + 2, 11, 14, 12), colors.f);
  }
  const head = blobPolygon(hx, hy, hrx, hry, 0.8, 16);
  sink.wash(head, colors.f);
  if (epicPose) drawSparkExtras(sink, hx + hrx * 0.9, hy - hry - 3, 5, colors.dk);

  const context: StandBodyContext = {
    v,
    isElephant,
    isDachshund,
    isCamel,
    isHorse,
    isMoose,
    isGiraffe,
    bx,
    by,
    brx,
    bry,
    bodyExponent,
    hx,
    hy,
    hrx,
    hry,
    headFrame,
    head,
    neckCurve,
    neck,
    maneTube,
    bodyRimY,
  };
  drawStandFace(sink, options, spec, colors, context);
};
