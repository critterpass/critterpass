/**
 * What the album says about this device's uploads for one trip: how many are going up, waiting,
 * failed or skipped, and how far along the batch is ("12 of 50" and its bar). Uploads for another
 * trip's album never count here.
 */
import type { UploadItem } from './upload-queue';

export interface UploadCounts {
  readonly uploading: number;
  readonly waiting: number;
  readonly failed: number;
  readonly skipped: number;
  /** Uploaded and registered, not yet cleared. */
  readonly done: number;
  /** Every photo of the batch still listed. */
  readonly total: number;
  /** The photo going up now, counted from one. */
  readonly position: number;
  /** How much of the batch is through, 0–1. */
  readonly fraction: number;
}

export const NO_UPLOADS: UploadCounts = {
  uploading: 0,
  waiting: 0,
  failed: 0,
  skipped: 0,
  done: 0,
  total: 0,
  position: 0,
  fraction: 0,
};

export function uploadCounts(items: readonly UploadItem[], tripId: string): UploadCounts {
  const mine = items.filter((item) => item.tripId === tripId);
  if (mine.length === 0) return NO_UPLOADS;
  const count = (state: UploadItem['state']) => mine.filter((item) => item.state === state).length;
  const uploading = count('uploading');
  const total = mine.length;
  const through = total - uploading;
  const partial = mine
    .filter((item) => item.state === 'uploading')
    .reduce((sum, item) => sum + Math.min(1, Math.max(0, item.progress)), 0);
  return {
    uploading,
    waiting: count('waiting'),
    failed: count('failed'),
    skipped: count('duplicate'),
    done: count('done'),
    total,
    position: Math.min(total, through + 1),
    fraction: (through + partial) / total,
  };
}

/** Only finished photos are left: the album shows them already, so the queue can forget them. */
export function onlyDoneLeft(counts: UploadCounts): boolean {
  return counts.done > 0 && counts.done === counts.total;
}

/** The same counts for a re-render: the banner redraws only when something it shows changed. */
export function sameCounts(a: UploadCounts, b: UploadCounts): boolean {
  return (
    a.uploading === b.uploading &&
    a.waiting === b.waiting &&
    a.failed === b.failed &&
    a.skipped === b.skipped &&
    a.done === b.done &&
    a.total === b.total &&
    Math.round(a.fraction * 100) === Math.round(b.fraction * 100)
  );
}
