/**
 * Splits a sources × targets matrix into blocks of at most `maxSide` × `maxSide`, runs them a few
 * at a time and stitches the cells back in input order. Valhalla's matrix time grows with the
 * grid, and the 25 × 25 cap keeps one block inside the 6 s budget even in dense metros.
 */
import { ValhallaError } from './errors';

export interface MatrixCells {
  /** `seconds[i][j]` from source i to destination j; `null` where no route exists. */
  readonly seconds: (number | null)[][];
  readonly meters: (number | null)[][];
}

export type BlockRunner<P> = (
  sources: readonly P[],
  destinations: readonly P[],
) => Promise<MatrixCells>;

interface Chunk<T> {
  readonly start: number;
  readonly items: T[];
}

function chunk<T>(items: readonly T[], size: number): Chunk<T>[] {
  const chunks: Chunk<T>[] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push({ start, items: items.slice(start, start + size) });
  }
  return chunks;
}

export function emptyCells(rows: number, cols: number): MatrixCells {
  return {
    seconds: Array.from({ length: rows }, () => Array<number | null>(cols).fill(null)),
    meters: Array.from({ length: rows }, () => Array<number | null>(cols).fill(null)),
  };
}

export async function runChunkedMatrix<P>(
  sources: readonly P[],
  destinations: readonly P[],
  run: BlockRunner<P>,
  options: { readonly maxSide: number; readonly concurrency: number },
): Promise<MatrixCells & { readonly requests: number }> {
  const result = emptyCells(sources.length, destinations.length);
  const blocks = chunk(sources, options.maxSide).flatMap((rows) =>
    chunk(destinations, options.maxSide).map((cols) => ({ rows, cols })),
  );
  let next = 0;
  async function worker(): Promise<void> {
    while (next < blocks.length) {
      const block = blocks[next];
      next += 1;
      if (block === undefined) return;
      const cells = await run(block.rows.items, block.cols.items);
      for (let i = 0; i < block.rows.items.length; i += 1) {
        const seconds = result.seconds[block.rows.start + i];
        const meters = result.meters[block.rows.start + i];
        if (seconds === undefined || meters === undefined) continue;
        for (let j = 0; j < block.cols.items.length; j += 1) {
          seconds[block.cols.start + j] = cells.seconds[i]?.[j] ?? null;
          meters[block.cols.start + j] = cells.meters[i]?.[j] ?? null;
        }
      }
    }
  }
  const workers = Math.max(1, Math.min(options.concurrency, blocks.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { ...result, requests: blocks.length };
}

/**
 * Valhalla fails a whole matrix when one point is off the road graph. Find those points, run the
 * rest, and leave the off-graph rows and columns empty so only they fall back.
 */
export async function runSkippingOffGraph<P>(
  sources: readonly P[],
  destinations: readonly P[],
  run: BlockRunner<P>,
  locate: (points: readonly P[]) => Promise<readonly { readonly onGraph: boolean }[]>,
): Promise<MatrixCells> {
  try {
    return await run(sources, destinations);
  } catch (error) {
    if (
      !(error instanceof ValhallaError) ||
      (error.kind !== 'off_graph' && error.kind !== 'no_route')
    ) {
      throw error;
    }
    const located = await locate([...sources, ...destinations]);
    const keptSources = sources.flatMap((point, i) =>
      located[i]?.onGraph === true ? [{ point, i }] : [],
    );
    const keptDestinations = destinations.flatMap((point, j) =>
      located[sources.length + j]?.onGraph === true ? [{ point, j }] : [],
    );
    if (keptSources.length === sources.length && keptDestinations.length === destinations.length) {
      throw error;
    }
    const cells = emptyCells(sources.length, destinations.length);
    if (keptSources.length === 0 || keptDestinations.length === 0) return cells;
    const kept = await run(
      keptSources.map((entry) => entry.point),
      keptDestinations.map((entry) => entry.point),
    );
    keptSources.forEach((source, a) => {
      const seconds = cells.seconds[source.i];
      const meters = cells.meters[source.i];
      keptDestinations.forEach((destination, b) => {
        if (seconds !== undefined) seconds[destination.j] = kept.seconds[a]?.[b] ?? null;
        if (meters !== undefined) meters[destination.j] = kept.meters[a]?.[b] ?? null;
      });
    });
    return cells;
  }
}
