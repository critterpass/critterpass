/**
 * Anonymous budget dots: each submitted max becomes a dot somewhere inside its bucket, never at
 * its value. Buckets are ~5 % of the track, widened to a whole number of band steps and aligned
 * on the same grid as the band edge, as (a, b] intervals so a max sitting exactly on a step lands
 * in the same bucket as the band's own uncertainty interval.
 */
import { fnv1a64 } from '../quotes/version-hash';

export interface DotTrack {
  readonly lowMinor: bigint;
  readonly highMinor: bigint;
}

const TRACK_BUCKETS = 20n;

function fraction(seed: string): number {
  return Number(BigInt(`0x${fnv1a64(seed)}`) % 1_000_000n) / 1_000_000;
}

export function bucketWidth(stepMinor: bigint, track: DotTrack): bigint {
  const span = track.highMinor - track.lowMinor;
  const raw = span > 0n ? span / TRACK_BUCKETS : stepMinor;
  const steps = raw <= stepMinor ? 1n : (raw + stepMinor - 1n) / stepMinor;
  return steps * stepMinor;
}

/**
 * Dot positions in [0, 1] along the track, ascending (no link to who submitted what). A dot stands
 * for an amount half a minor unit off the integer grid (its bucket start plus a seeded offset), so
 * it can never equal any max, which is always a whole number of minor units; nothing about the
 * position depends on a max's value beyond its bucket.
 */
export function bucketDots(
  maxes: readonly bigint[],
  stepMinor: bigint,
  track: DotTrack,
  seed: string,
): readonly number[] {
  const width = bucketWidth(stepMinor, track);
  const span = Number(track.highMinor - track.lowMinor);
  const buckets = maxes
    .map((value) => (value <= 0n ? 0n : (value - 1n) / width))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const perBucket = new Map<bigint, number>();
  return buckets
    .map((bucket) => {
      const ordinal = perBucket.get(bucket) ?? 0;
      perBucket.set(bucket, ordinal + 1);
      const jitter = fraction(`${seed}:${bucket.toString()}:${ordinal}`);
      const offset = Math.floor(jitter * Number(width)) + 0.5;
      const amount = Number(bucket * width - track.lowMinor) + offset;
      // Off the track: pinned half a unit inside its ends, still off the integer grid.
      return span > 0 ? Math.min(span - 0.5, Math.max(0.5, amount)) / span : 0.5;
    })
    .sort((a, b) => a - b);
}
