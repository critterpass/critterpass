/**
 * Parallel lanes (3e-2): items that overlap in time sit side by side. An item's own lane (the
 * attendee subset it belongs to, e.g. the spa for Maya and Rin) keeps a steady column within its
 * cluster; the day's main lane is column 0. Items only share a cluster when their times overlap,
 * so a quiet morning keeps full-width blocks.
 */
export interface LaneInput {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  /** The item's lane key; null is the day's main lane. */
  readonly lane: string | null;
}

export interface LanePlacement {
  readonly column: number;
  /** Columns in this block's cluster. */
  readonly columns: number;
}

function overlaps(a: LaneInput, b: LaneInput): boolean {
  return a.start < b.end && b.start < a.end;
}

export function layoutLanes(blocks: readonly LaneInput[]): Map<string, LanePlacement> {
  const sorted = [...blocks].sort(
    (a, b) =>
      a.start - b.start ||
      (a.lane === null ? -1 : 0) - (b.lane === null ? -1 : 0) ||
      a.id.localeCompare(b.id),
  );
  const placements = new Map<string, LanePlacement>();
  let cluster: LaneInput[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    const keys: (string | null)[] = [null];
    for (const block of cluster) if (!keys.includes(block.lane)) keys.push(block.lane);
    const placed: { block: LaneInput; column: number }[] = [];
    for (const block of cluster) {
      let column = keys.indexOf(block.lane);
      // Taken by an overlapping block already there: the next free column.
      while (placed.some((p) => p.column === column && overlaps(p.block, block))) column += 1;
      placed.push({ block, column });
    }
    const used = placed.map((p) => p.column);
    // Columns nobody in this cluster uses (the main lane when only subsets overlap) are dropped.
    const distinct = [...new Set(used)].sort((a, b) => a - b);
    for (const p of placed) {
      placements.set(p.block.id, { column: distinct.indexOf(p.column), columns: distinct.length });
    }
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };
  for (const block of sorted) {
    if (cluster.length > 0 && block.start >= clusterEnd) flush();
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  if (cluster.length > 0) flush();
  return placements;
}
