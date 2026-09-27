/** Nearest-rank percentile over millisecond samples; `p` in [0, 100]. Empty input is 0. */
export function percentile(samplesMs: readonly number[], p: number): number {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[index] ?? 0;
}

export interface LatencySummary {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export function summarize(samplesMs: readonly number[]): LatencySummary {
  const count = samplesMs.length;
  const meanMs = count === 0 ? 0 : samplesMs.reduce((sum, v) => sum + v, 0) / count;
  return {
    count,
    meanMs,
    p50Ms: percentile(samplesMs, 50),
    p95Ms: percentile(samplesMs, 95),
    p99Ms: percentile(samplesMs, 99),
    maxMs: count === 0 ? 0 : Math.max(...samplesMs),
  };
}

/** Times `fn` `iterations` times sequentially, returning one sample per call in milliseconds. */
export async function timeSequential(
  iterations: number,
  fn: () => Promise<void>,
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    // Intentionally sequential: this measures round-trip latency one call at a time, which
    // concurrent calls would understate.
    await fn();
    samples.push(performance.now() - startedAt);
  }
  return samples;
}
