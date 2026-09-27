import type { Point } from '../../../core/geometry';
import { pointAt } from '../../../core/geometry';
import { W } from '../../../core/ops';
import type { OpSink } from '../../../core/ops';
import type { CritterSpec } from '../../../data/types';
import { transformHeadLocal } from '../helpers';
import type { HeadFrame } from '../helpers';
import type { ArchetypeColors } from '../types';

/** design/critters-draw-1.js `HORN`: each entry is exactly one of a stroked line (`s`), a washed patch (`p`), a bundle of stroked lines (`a`), or the hard-coded spiral (`c`). */
type HornShape =
  | { readonly s: readonly Point[]; readonly w: number; readonly dark?: true; readonly knob?: true }
  | { readonly p: readonly Point[] }
  | { readonly a: readonly (readonly Point[])[] }
  | { readonly c: true };

const HORN: Readonly<Record<string, HornShape>> = {
  back: {
    s: [
      [-8, -16],
      [-11, -28],
      [-19, -34],
      [-26, -30],
    ],
    w: 6,
  },
  straight: {
    s: [
      [-7, -16],
      [-15, -42],
    ],
    w: 4.6,
  },
  hook: {
    s: [
      [-6, -16],
      [-6, -28],
      [-10, -32],
      [-13.5, -29],
    ],
    w: 4.2,
    dark: true,
  },
  nub: {
    s: [
      [-9, -15],
      [-13, -22],
    ],
    w: 5,
  },
  ossi: {
    s: [
      [-6, -17],
      [-7, -28],
    ],
    w: 3.6,
    knob: true,
  },
  bull: {
    p: [
      [-13, -13],
      [-28, -15],
      [-41, -25],
      [-43, -35],
      [-36, -28],
      [-25, -22],
      [-11, -18],
    ],
  },
  antler: {
    a: [
      [
        [-8, -16],
        [-14, -31],
        [-22, -42],
      ],
      [
        [-13, -28],
        [-5, -37],
      ],
      [
        [-18, -37],
        [-27, -38],
      ],
    ],
  },
  palm: {
    p: [
      [-8, -16],
      [-14, -27],
      [-25, -31],
      [-31, -41],
      [-25, -39],
      [-21, -45],
      [-17, -39],
      [-13, -43],
      [-11, -35],
      [-6, -30],
    ],
  },
  moose: {
    p: [
      [-12, -13],
      [-22, -15],
      [-33, -13],
      [-42, -21],
      [-41, -28],
      [-37, -24],
      [-35, -32],
      [-31, -26],
      [-29, -34],
      [-25, -26],
      [-21, -30],
      [-19, -22],
      [-12, -19],
    ],
  },
  curl: { c: true },
};

/** design/critters-draw-1.js `horns`: `hc2` overrides the horn colour; otherwise dark horns use the spot colour, others a shared bone cream. */
export function drawHorns(
  sink: OpSink,
  type: string | undefined,
  head: HeadFrame,
  colors: ArchetypeColors,
  spec: Pick<CritterSpec, 'hc2'>,
): void {
  const horn = type !== undefined ? HORN[type] : undefined;
  if (!horn) return;
  const hornColor = spec.hc2 || ('dark' in horn && horn.dark ? colors.dk : '#f4e3c8');

  for (const mirror of [false, true]) {
    if ('s' in horn) {
      const p = transformHeadLocal(horn.s, head, mirror);
      sink.stroke(p, hornColor, horn.w * head.k);
      sink.line(p, { w: 2.1 });
      if (horn.knob) {
        const tip = pointAt(p, p.length - 1);
        sink.dot(tip[0], tip[1], 2.8 * head.k, colors.dk);
      }
    }
    if ('p' in horn) {
      W(sink, transformHeadLocal(horn.p, head, mirror), hornColor, 2.1);
    }
    if ('a' in horn) {
      for (const line of horn.a) {
        const p = transformHeadLocal(line, head, mirror);
        sink.stroke(p, hornColor, 3.6 * head.k);
        sink.line(p, { w: 2.1 });
      }
    }
    if ('c' in horn) {
      const spiral: Point[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = -1.4 + i * 0.42;
        const r = 9 - i * 0.45;
        spiral.push([-22 + Math.cos(a) * r, -6 + Math.sin(a) * r]);
      }
      const p = transformHeadLocal(spiral, head, mirror);
      sink.stroke(p, hornColor, 5.2 * head.k);
      sink.line(p, { w: 2 });
    }
  }
}
