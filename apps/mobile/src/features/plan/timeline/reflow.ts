/**
 * Collision reflow while a block moves (3e-2 "the others shuffle out of the way"): blocks in the
 * same lane (the same people) that the moved block now overlaps are pushed out of its way — the
 * ones below it later, the ones above it earlier — each keeping its length, cascading, and staying
 * inside the day. A booked or fixed block never moves: a move that would have to push one is
 * refused, and so is one that runs out of day.
 */
/* eslint-disable lingui/no-unlocalized-strings -- result reasons, never copy. */
export interface ReflowBlock {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly lane: string | null;
  readonly fixed: boolean;
}

export type ReflowResult =
  | { readonly ok: true; readonly starts: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly reason: 'fixed' | 'no_room'; readonly blockedBy: string | null };

export function reflow(
  blocks: readonly ReflowBlock[],
  moved: { readonly id: string; readonly start: number; readonly lane: string | null },
  bounds: { readonly min: number; readonly max: number },
): ReflowResult {
  const self = blocks.find((block) => block.id === moved.id);
  if (self === undefined) return { ok: true, starts: new Map() };
  if (self.fixed && self.start !== moved.start)
    return { ok: false, reason: 'fixed', blockedBy: self.id };
  const length = self.end - self.start;
  const starts = new Map<string, number>([[moved.id, moved.start]]);
  const others = blocks.filter((block) => block.id !== moved.id && block.lane === moved.lane);
  const below = others.filter((b) => b.start >= moved.start).sort((a, b) => a.start - b.start);
  const above = others.filter((b) => b.start < moved.start).sort((a, b) => b.start - a.start);

  let edge = moved.start + length;
  for (const block of below) {
    if (block.start >= edge) break;
    if (block.fixed) return { ok: false, reason: 'fixed', blockedBy: block.id };
    const next = edge;
    const blockLength = block.end - block.start;
    if (next + blockLength > bounds.max)
      return { ok: false, reason: 'no_room', blockedBy: block.id };
    starts.set(block.id, next);
    edge = next + blockLength;
  }
  edge = moved.start;
  for (const block of above) {
    if (block.end <= edge) break;
    if (block.fixed) return { ok: false, reason: 'fixed', blockedBy: block.id };
    const blockLength = block.end - block.start;
    const next = edge - blockLength;
    if (next < bounds.min) return { ok: false, reason: 'no_room', blockedBy: block.id };
    starts.set(block.id, next);
    edge = next;
  }
  return { ok: true, starts };
}
