import { mixInto } from './signal';

export interface Track {
  readonly buffer: Float32Array;
  readonly gain?: number;
  readonly startSample?: number;
}

/** Sums tracks (each with its own gain and start offset) into one buffer of `totalLengthSamples`. */
export function mixTracks(totalLengthSamples: number, tracks: readonly Track[]): Float32Array {
  const out = new Float32Array(totalLengthSamples);
  for (const track of tracks) {
    mixInto(out, track.buffer, track.gain ?? 1, track.startSample ?? 0);
  }
  return out;
}

/**
 * Blends the end of a loop into its own start so wrap playback has no discontinuity: the last
 * `crossfadeSamples` are replaced by an equal-power blend of themselves and the buffer's own head,
 * so by the final sample the tail closely matches the head it will be followed by on repeat.
 */
export function makeLoopSeamless(buf: Float32Array, crossfadeSamples: number): void {
  const n = Math.min(crossfadeSamples, Math.floor(buf.length / 2));
  if (n <= 0) return;
  const headCopy = buf.slice(0, n);
  for (let i = 0; i < n; i += 1) {
    const g = i / n;
    const towardHead = Math.sin((Math.PI / 2) * g);
    const keepTail = Math.cos((Math.PI / 2) * g);
    const tailIdx = buf.length - n + i;
    buf[tailIdx] = (buf[tailIdx] ?? 0) * keepTail + (headCopy[i] ?? 0) * towardHead;
  }
  // Guarantee bit-exact wrap continuity at the join itself, the one sample pair that actually abuts.
  buf[buf.length - 1] = buf[0] ?? 0;
}

export interface LoopSeamReport {
  readonly wrapJump: number;
  readonly maxNeighbourJump: number;
}

/** Measures the discontinuity at a loop's wrap point, for bake-time verification and tests. */
export function measureLoopSeam(buf: Float32Array, windowSamples = 64): LoopSeamReport {
  const wrapJump = Math.abs((buf[buf.length - 1] ?? 0) - (buf[0] ?? 0));
  let maxNeighbourJump = 0;
  const n = Math.min(windowSamples, buf.length - 1);
  for (let i = 0; i < n; i += 1) {
    const a = Math.abs((buf[i + 1] ?? 0) - (buf[i] ?? 0));
    const b = Math.abs((buf[buf.length - 1 - i] ?? 0) - (buf[buf.length - 2 - i] ?? 0));
    maxNeighbourJump = Math.max(maxNeighbourJump, a, b);
  }
  return { wrapJump, maxNeighbourJump };
}
