/**
 * The banner over the album grid while this device has photos for the trip going up, waiting,
 * failed or skipped: the line ("Uploading 12 of 50 photos."), a bar while they go up, "try the
 * failed ones again", and a way to put a skipped notice away. It follows the upload queue by
 * itself, so the grid under it is not redrawn as bytes move; finished photos leave the queue as
 * soon as nothing else of the trip is in it.
 */
import { useEffect, useRef, useSyncExternalStore, type ComponentType } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { albumUploadQueue } from './device-upload';
import { onlyDoneLeft, sameCounts, uploadCounts, type UploadCounts } from './upload-summary';

export interface UploadBannerViewProps {
  readonly counts: UploadCounts;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}

export function UploadBanner({
  tripId,
  onRetry,
  View: BannerView,
}: {
  readonly tripId: string;
  readonly onRetry: () => void;
  /** The look of the banner. */
  readonly View: ComponentType<UploadBannerViewProps>;
}) {
  const { commands } = useLocalFirst();
  const queue = albumUploadQueue(commands);
  const last = useRef<UploadCounts | null>(null);
  const counts = useSyncExternalStore(queue.subscribe, () => {
    const next = uploadCounts(queue.items(), tripId);
    if (last.current !== null && sameCounts(last.current, next)) return last.current;
    last.current = next;
    return next;
  });
  const settled = onlyDoneLeft(counts);
  useEffect(() => {
    if (settled) queue.clearSettled(tripId);
  }, [settled, queue, tripId]);
  return (
    <BannerView counts={counts} onRetry={onRetry} onDismiss={() => queue.clearSettled(tripId)} />
  );
}
