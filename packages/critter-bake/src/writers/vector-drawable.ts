import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Cmd, RenderSpec } from '@cp/critter-art';
import { build, frame, resolveKind } from '@cp/critter-art';

/** Android's status-bar/notification small icon viewport convention (24dp square). */
export const SMALL_ICON_VIEWPORT = 24;

function formatNum(value: number): string {
  // 2 decimals: enough precision for a 24dp glyph, short enough to keep the XML deterministic and
  // readable (raw Float32 values carry ~7 noisy digits nobody needs here).
  return (Math.round(value * 100) / 100).toString();
}

/** `Float32Array` reads are `number | undefined` under `noUncheckedIndexedAccess`; every call site here loops within its own known bounds, so an `undefined` read means a real off-by-one, not a case to swallow with `!`. */
function coord(pts: Float32Array, index: number): number {
  const value = pts[index];
  if (value === undefined) {
    throw new Error(`vector-drawable: point index ${index} out of range (${pts.length} values)`);
  }
  return value;
}

/** Walks a built frame's `Cmd` tree collecting every filled polygon's point array — `polyline` (stroke-only ink lines) are skipped: a 24dp status-bar glyph reads as a solid silhouette, not line art, so this pipeline only needs the fills. */
function collectFillPolygons(cmds: readonly Cmd[], out: Float32Array[]): void {
  for (const cmd of cmds) {
    if (cmd.t === 'poly') out.push(cmd.pts);
    else if (cmd.t === 'layer') collectFillPolygons(cmd.cmds, out);
  }
}

/** One flattened polygon's points -> one SVG/VectorDrawable `M...Z` path subcommand. */
function polygonToPathData(pts: Float32Array): string {
  if (pts.length < 6) return '';
  const commands = [`M${formatNum(coord(pts, 0))},${formatNum(coord(pts, 1))}`];
  for (let i = 2; i < pts.length; i += 2) {
    commands.push(`L${formatNum(coord(pts, i))},${formatNum(coord(pts, i + 1))}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

/** A filled ring (outer circle minus inner circle) as one even-odd path, approximated with `segments`-gon polygons — good enough at 24dp that no viewer can tell it apart from a true circle. */
function ringPathData(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  segments = 48,
): string {
  const circle = (r: number): string => {
    const points: string[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push(
        `${i === 0 ? 'M' : 'L'}${formatNum(cx + r * Math.cos(angle))},${formatNum(cy + r * Math.sin(angle))}`,
      );
    }
    return `${points.join(' ')} Z`;
  };
  return `${circle(outerR)} ${circle(innerR)}`;
}

/** Scales+centres a kind's own (possibly non-square) view box into an `inset`-margin square inside `viewport`, preserving aspect ratio — so the STAMP critter's silhouette sits inside the ring without distorting it. */
function fitPolygonToBox(
  pts: Float32Array,
  viewBoxW: number,
  viewBoxH: number,
  viewport: number,
  inset: number,
): Float32Array {
  const box = viewport - inset * 2;
  const scale = Math.min(box / viewBoxW, box / viewBoxH);
  const offsetX = inset + (box - viewBoxW * scale) / 2;
  const offsetY = inset + (box - viewBoxH * scale) / 2;
  const out = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = coord(pts, i) * scale + offsetX;
    out[i + 1] = coord(pts, i + 1) * scale + offsetY;
  }
  return out;
}

export interface StampVectorDrawableOptions {
  readonly critterSpec: RenderSpec;
  readonly viewport?: number;
}

/**
 * Builds the notification small icon's VectorDrawable XML: the STAMP app icon's ring (phase spec:
 * "Stamp polygons -> SVG -> VectorDrawable small icon") plus the stamped critter's own mask-variant
 * silhouette, both flattened into one `android:fillColor="#FFFFFFFF"` path set — Android's status
 * bar renders small icons as a plain white glyph and applies its own tinting, so the exact fill
 * colour here is a placeholder white, not a design choice this pipeline needs to get "right".
 */
export function buildStampVectorDrawable(options: StampVectorDrawableOptions): string {
  const viewport = options.viewport ?? SMALL_ICON_VIEWPORT;
  const center = viewport / 2;
  const outerR = viewport * 0.46;
  const innerR = viewport * 0.38;

  const { viewBox } = resolveKind(options.critterSpec.kind);
  const model = build(options.critterSpec, 64);
  const cmds = frame(model, 1);
  const rawPolygons: Float32Array[] = [];
  collectFillPolygons(cmds, rawPolygons);
  const fitted = rawPolygons.map((pts) =>
    fitPolygonToBox(pts, viewBox[0], viewBox[1], viewport, viewport * 0.22),
  );

  const ringPath = ringPathData(center, center, outerR, innerR);
  // The ring is one even-odd path (it needs its inner circle to punch a hole); the critter's own
  // polygons go in a *separate* non-zero-fill path instead of joining the ring's even-odd path —
  // combining unrelated overlapping shapes under one even-odd rule would silently punch holes
  // anywhere two of the critter's own shapes overlap (e.g. limbs crossing the body outline).
  const critterPath = fitted
    .map(polygonToPathData)
    .filter((segment) => segment.length > 0)
    .join(' ');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${viewport}dp"`,
    `    android:height="${viewport}dp"`,
    `    android:viewportWidth="${viewport}"`,
    `    android:viewportHeight="${viewport}"`,
    '    android:tint="?attr/colorControlNormal">',
    `    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${ringPath}"/>`,
    `    <path android:fillColor="#FFFFFFFF" android:fillType="nonZero" android:pathData="${critterPath}"/>`,
    '</vector>',
    '',
  ].join('\n');
}

export function writeStampVectorDrawable(
  resDir: string,
  options: StampVectorDrawableOptions,
): void {
  const drawableDir = resolve(resDir, 'drawable');
  mkdirSync(drawableDir, { recursive: true });
  writeFileSync(
    resolve(drawableDir, 'ic_stat_notification.xml'),
    buildStampVectorDrawable(options),
  );
}
