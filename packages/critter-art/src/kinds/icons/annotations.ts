import type { KindFn } from '../registry';

/** design/doodles.js `K.underline`: own viewBox `[100, 14]` (`I(fn, vb)` in the design source). */
export const underline: KindFn = (sink, options) => {
  sink.line(
    [
      [2, 10],
      [40, 6.5],
      [98, 8],
    ],
    { w: 3.4, taper: true, color: options.accent ?? options.ink },
  );
};

/** design/doodles.js `K.circle`: own viewBox `[100, 50]`. */
export const circle: KindFn = (sink, options) => {
  const points: [number, number][] = [];
  for (let i = 0; i <= 26; i++) {
    const a = -2.4 + (i / 24) * 6.283 * 1.02;
    points.push([50 + Math.cos(a) * (46 - i * 0.12), 25 + Math.sin(a) * (19 + i * 0.06)]);
  }
  sink.line(points, { w: 2.6, taper: true, color: options.accent ?? options.ink });
};

/** design/doodles.js `K.arrow`: own viewBox `[100, 40]`. */
export const arrow: KindFn = (sink, options) => {
  const color = options.accent ?? options.ink;
  sink.line(
    [
      [4, 30],
      [30, 10],
      [66, 12],
      [92, 26],
    ],
    { w: 3.6, taper: true, color },
  );
  sink.line(
    [
      [80, 14],
      [93, 26],
      [78, 33],
    ],
    { w: 3.6, color },
  );
};

/** design/doodles.js `K.squiggle`: own viewBox `[100, 20]`. */
export const squiggle: KindFn = (sink, options) => {
  const points: [number, number][] = [];
  for (let i = 0; i <= 40; i++) points.push([2 + i * 2.4, 10 + Math.sin(i * 0.9) * 5]);
  sink.line(points, { w: 2.6, color: options.accent ?? options.ink });
};

/** viewBoxes for the annotation icons (design's `I(fn, vb)`); every other kind uses the 100x100 default. */
export const ANNOTATION_VIEW_BOXES: Readonly<Record<string, readonly [number, number]>> = {
  underline: [100, 14],
  circle: [100, 50],
  arrow: [100, 40],
  squiggle: [100, 20],
};
