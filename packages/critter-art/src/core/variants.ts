import type { BuiltOp } from './model';

/** Parses a `#rgb`/`#rrggbb` hex colour into 0–255 channels; non-hex input (never produced by the ported kinds) falls back to mid-grey rather than throwing. */
function parseHexRgb(color: string): readonly [number, number, number] {
  const hex = color.startsWith('#') ? color.slice(1) : '';
  if (hex.length === 3) {
    const [r, g, b] = hex;
    return [parseInt((r ?? '8') + (r ?? '8'), 16), parseInt((g ?? '8') + (g ?? '8'), 16), parseInt((b ?? '8') + (b ?? '8'), 16)];
  }
  if (hex.length === 6) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return [128, 128, 128];
}

/** Rec. 601 perceptual luminance, rounded to an integer 0–255 grey channel. */
function luminanceGray(color: string): string {
  const [r, g, b] = parseHexRgb(color);
  const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  return `rgb(${l},${l},${l})`;
}

/** design's `lock()`: recolours every op to one colour at full opacity, forcing source-over — used for silhouettes (`locked`) and any other single-colour mask surface. */
export function applyMaskVariant(ops: readonly BuiltOp[], color: string): BuiltOp[] {
  return ops.map((op): BuiltOp => {
    if (op.t === 'wash' || op.t === 'fill') return { ...op, color, alpha: 1 };
    return { ...op, color };
  });
}

/**
 * Recolours every op to its own perceptual-luminance grey, keeping every op's original alpha/blend.
 * For OS-tinted surfaces (iOS accented/desaturated widget rendering, Android monochrome icons) that
 * read shape from luminance rather than hue.
 */
export function applyMonoVariant(ops: readonly BuiltOp[]): BuiltOp[] {
  return ops.map((op): BuiltOp => ({ ...op, color: luminanceGray(op.color) }));
}

/**
 * Keeps only ink line ops (drops wash/under/fill), recoloured to one ink colour — a clean line-art
 * "stamp" for Android's monochrome/small icon source, per design's own line/stroke/wash/fill/dot
 * vocabulary ("line ops only, no washes").
 */
export function applyStampVariant(ops: readonly BuiltOp[], inkColor: string): BuiltOp[] {
  return ops.filter((op) => op.t === 'line').map((op): BuiltOp => ({ ...op, color: inkColor }));
}
