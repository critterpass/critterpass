// Design analysis report §4: the sticker renderer never rasterizes at an arbitrary requested size —
// it snaps up to the nearest of a fixed bucket list so the cache gets real reuse across screens.
export const SIZE_BUCKETS_PT: readonly number[] = [24, 36, 48, 60, 96, 150, 232, 300];

/** The smallest bucket ≥ `requestedPt`, or the largest bucket if the request exceeds all of them. */
export function nearestBucket(requestedPt: number): number {
  for (const bucket of SIZE_BUCKETS_PT) {
    if (bucket >= requestedPt) return bucket;
  }
  const largest = SIZE_BUCKETS_PT[SIZE_BUCKETS_PT.length - 1];
  if (largest === undefined) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    throw new Error('nearestBucket: SIZE_BUCKETS_PT is empty');
  }
  return largest;
}
