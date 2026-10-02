/**
 * `tex.hatch` as one small seamless tile, drawn once per colour and screen density and then shown
 * as a repeating image. A live Skia canvas per hatched block (every skeleton line, every photo
 * placeholder) is a GL surface of its own on Android, and a loading screen made dozens.
 *
 * The stripes run at 45° or 135°, so a square tile whose side is a whole number of stripe periods
 * along both axes repeats without a seam. The side is a whole number of device pixels; the period
 * is nudged by at most half a pixel spread over the tile's stripes so both hold at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a data URI prefix and cache keys, never copy. */
import type * as RNSkiaModule from '@shopify/react-native-skia';

export interface HatchTileInput {
  readonly angleDeg: number;
  /** Stripe width and gap, in points. */
  readonly stripePt: number;
  readonly gapPt: number;
  readonly color: string;
  readonly base: string;
  /** Device pixels per point. */
  readonly scale: number;
}

export interface HatchTileLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface HatchTileGeometry {
  /** The tile's side, in device pixels. */
  readonly sizePx: number;
  readonly strokePx: number;
  /** Stripe centre lines in tile pixels, extended past every edge so the strokes wrap. */
  readonly lines: readonly HatchTileLine[];
}

/** About this many pixels a side: a few periods, so the nudge to whole pixels stays tiny. */
const TARGET_PX = 128;

/** Whether the stripes' angle tiles in a square (45° and 135°, in any turn). */
export function tilesSquare(angleDeg: number): boolean {
  const a = ((angleDeg % 180) + 180) % 180;
  return a === 45 || a === 135;
}

export function hatchTileGeometry(input: HatchTileInput): HatchTileGeometry {
  // At 45° and 135° the stripes repeat every period·√2 along x and along y.
  const stepPx = (input.stripePt + input.gapPt) * Math.SQRT2 * input.scale;
  const periods = Math.max(1, Math.round(TARGET_PX / stepPx));
  const sizePx = Math.max(1, Math.round(periods * stepPx));
  const step = sizePx / periods;
  const falling = ((input.angleDeg % 180) + 180) % 180 === 135;
  const lines: HatchTileLine[] = [];
  // Lines x + y = c (135°) or y − x = c (45°), for every c that can touch the tile.
  for (let k = -3 * periods; k <= 4 * periods; k += 1) {
    const c = k * step;
    lines.push(
      falling
        ? { x1: c + 2 * sizePx, y1: -2 * sizePx, x2: c - 3 * sizePx, y2: 3 * sizePx }
        : { x1: -2 * sizePx, y1: c - 2 * sizePx, x2: 3 * sizePx, y2: c + 3 * sizePx },
    );
  }
  return { sizePx, strokePx: input.stripePt * input.scale, lines };
}

export interface HatchTile {
  readonly uri: string;
  /** The tile's side in points, for the image source. */
  readonly sizePt: number;
  readonly scale: number;
}

const tiles = new Map<string, HatchTile | null>();

/** The tile as a PNG data URI, drawn on a CPU raster surface (never a GL view); null without Skia. */
export function hatchTile(input: HatchTileInput): HatchTile | null {
  const key = `${input.angleDeg}|${input.stripePt}|${input.gapPt}|${input.color}|${input.base}|${input.scale}`;
  const known = tiles.get(key);
  if (known !== undefined) return known;
  let tile: HatchTile | null = null;
  try {
    // Loaded here, not at import: the tile is optional and Jest suites stand Skia in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const { Skia, PaintStyle } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
    const geometry = hatchTileGeometry(input);
    const surface = Skia.Surface.Make(geometry.sizePx, geometry.sizePx);
    if (surface !== null) {
      const canvas = surface.getCanvas();
      const fill = Skia.Paint();
      fill.setColor(Skia.Color(input.base));
      canvas.drawRect(Skia.XYWHRect(0, 0, geometry.sizePx, geometry.sizePx), fill);
      const stroke = Skia.Paint();
      stroke.setColor(Skia.Color(input.color));
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(geometry.strokePx);
      stroke.setAntiAlias(true);
      for (const line of geometry.lines) {
        canvas.drawLine(line.x1, line.y1, line.x2, line.y2, stroke);
      }
      surface.flush();
      const base64 = surface.makeImageSnapshot().encodeToBase64();
      tile = {
        uri: `data:image/png;base64,${base64}`,
        sizePt: geometry.sizePx / input.scale,
        scale: input.scale,
      };
    }
  } catch {
    tile = null;
  }
  tiles.set(key, tile);
  return tile;
}
