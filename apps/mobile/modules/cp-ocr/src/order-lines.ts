import type { OcrBox, OcrLine, RawOcrLine } from './types';

/** Two boxes share a row when they overlap vertically by at least this much of the shorter one. */
const ROW_OVERLAP = 0.5;
/** …and neither is more than this many times taller (a logo or a stamp is not part of a row). */
const ROW_HEIGHT_RATIO = 2.5;

interface Box {
  readonly text: string;
  readonly bbox: OcrBox;
  readonly conf: number;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly height: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Four decimals: well under a pixel on any photo, and identical output on both platforms. */
const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

function toBox(raw: RawOcrLine): Box | null {
  const text = raw.text.trim();
  if (text.length === 0) return null;
  const x = clamp01(raw.bbox[0]);
  const y = clamp01(raw.bbox[1]);
  const w = Math.min(clamp01(raw.bbox[2]), 1 - x);
  const h = Math.min(clamp01(raw.bbox[3]), 1 - y);
  const bbox: OcrBox = [round4(x), round4(y), round4(w), round4(h)];
  return { text, bbox, conf: round4(clamp01(raw.conf)), top: y, bottom: y + h, left: x, height: h };
}

function sharesRow(a: Box, b: Box): boolean {
  const shorter = Math.min(a.height, b.height);
  const taller = Math.max(a.height, b.height);
  if (shorter <= 0 || taller / shorter > ROW_HEIGHT_RATIO) return false;
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return overlap / shorter >= ROW_OVERLAP;
}

const byPosition = (a: Box, b: Box): number =>
  a.top - b.top || a.left - b.left || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0);

const centre = (row: readonly Box[]): number =>
  row.reduce((sum, box) => sum + box.top + box.height / 2, 0) / row.length;

/**
 * Puts recognised lines in reading order and gives them stable ids `l0`, `l1`, …: rows top to
 * bottom, and within a row left to right, so a receipt's item and its price on the far right keep
 * adjacent ids even when the recogniser reports them as separate lines of a slightly tilted photo.
 * Lines with no text are dropped; boxes and confidences are clamped to 0..1.
 */
export function orderLines(raw: readonly RawOcrLine[]): OcrLine[] {
  const boxes = raw.map(toBox).filter((box): box is Box => box !== null);
  boxes.sort(byPosition);
  const rows: Box[][] = [];
  for (const box of boxes) {
    let best: Box[] | undefined;
    let bestOverlap = 0;
    for (const row of rows) {
      for (const member of row) {
        if (!sharesRow(member, box)) continue;
        const overlap = Math.min(member.bottom, box.bottom) - Math.max(member.top, box.top);
        if (overlap > bestOverlap) {
          best = row;
          bestOverlap = overlap;
        }
      }
    }
    if (best) best.push(box);
    else rows.push([box]);
  }
  const ordered = rows
    .map((row) => ({
      row: [...row].sort((a, b) => a.left - b.left || byPosition(a, b)),
      y: centre(row),
    }))
    .sort((a, b) => a.y - b.y || byPosition(a.row[0] as Box, b.row[0] as Box))
    .flatMap(({ row }) => row);
  return ordered.map((box, index) => ({
    id: `l${index}`,
    text: box.text,
    bbox: box.bbox,
    conf: box.conf,
  }));
}
