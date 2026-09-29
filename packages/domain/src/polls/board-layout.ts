/**
 * The destination board's free-positioned stickers (3b-2): a deterministic layout for 1–8
 * candidates plus the dashed "PITCH A PLACE" slot, seeded by the poll id so every device draws the
 * same board. Each item sits in its own cell of a staggered grid with a seeded nudge smaller than
 * the cell margin, so stickers never overlap; rotations and float loops (4000–5000 ms, staggered)
 * come from the same seed.
 */
import { BOARD_MAX_CANDIDATES } from './kinds';

export interface BoardItemLayout {
  /** Candidate option id, or `null` for the pitch slot. */
  readonly id: string | null;
  /** Centre, in board widths (x ∈ [0, 1], y ∈ [0, height]). */
  readonly cx: number;
  readonly cy: number;
  /** Sticker diameter, in board widths. */
  readonly size: number;
  readonly rotationDeg: number;
  readonly floatMs: number;
  readonly floatDelayMs: number;
}

export interface BoardLayout {
  /** Board height in board widths. */
  readonly height: number;
  readonly items: readonly BoardItemLayout[];
}

/** Height of one grid row, in board widths. */
const ROW_HEIGHT = 0.42;
/** Fraction of the smaller cell side a sticker takes; the rest is room for the seeded nudge. */
const FILL = 0.72;

/** FNV-1a over the seed, then mulberry32: small, fast and identical on every platform. */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function columnsFor(items: number): number {
  if (items <= 2) return items;
  if (items <= 4) return 2;
  return 3;
}

export function boardLayout(pollId: string, candidateIds: readonly string[]): BoardLayout {
  const ids = candidateIds.slice(0, BOARD_MAX_CANDIDATES);
  const slots: (string | null)[] = [...ids, null];
  const random = seededRandom(pollId);
  const cols = columnsFor(slots.length);
  const rows = Math.ceil(slots.length / cols);
  const cellW = 1 / cols;
  const size = Math.min(cellW, ROW_HEIGHT) * FILL;
  const slackX = (cellW - size) / 2;
  const slackY = (ROW_HEIGHT - size) / 2;
  const items = slots.map((id, index) => {
    const row = Math.floor(index / cols);
    const inRow = Math.min(cols, slots.length - row * cols);
    // A short last row is centred; odd rows lean right so the board reads as a scatter.
    const rowShift = ((cols - inRow) * cellW) / 2;
    const col = index % cols;
    const lean = row % 2 === 1 ? slackX * 0.5 : -slackX * 0.5;
    const cx = rowShift + (col + 0.5) * cellW + lean * (inRow === cols ? 1 : 0);
    const nudgeX = (random() * 2 - 1) * slackX * 0.45;
    const nudgeY = (random() * 2 - 1) * slackY * 0.9;
    const rotationDeg = id === null ? 0 : Math.round((random() * 2 - 1) * 8);
    return {
      id,
      cx: Math.min(1 - size / 2, Math.max(size / 2, cx + nudgeX)),
      cy: (row + 0.5) * ROW_HEIGHT + nudgeY,
      size,
      rotationDeg,
      floatMs: 4000 + Math.round(random() * 1000),
      floatDelayMs: index * 350,
    };
  });
  return { height: rows * ROW_HEIGHT, items };
}
