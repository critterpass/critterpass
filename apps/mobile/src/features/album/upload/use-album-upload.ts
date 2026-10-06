/**
 * The album screen's view of uploads: what is going up from this device for the trip, "+ UPLOAD"
 * (the system picker, then the queue), retrying failed ones, and sending waiting ones again as soon
 * as the phone is back online.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useOnline } from '@/data/places/server-name-search';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLiveRows } from '@/data/plan/live-rows';

import { albumUploadQueue, pickAlbumPhotos } from './device-upload';
import type { UploadItem } from './upload-queue';

const SHAS_SQL = 'SELECT sha256 FROM photos WHERE trip_id = ? AND deleted_at IS NULL';

export interface AlbumUploadView {
  readonly items: readonly UploadItem[];
  readonly uploading: number;
  readonly waiting: number;
  readonly failed: number;
  readonly skipped: number;
  /** The picker failed to open (not a refusal; trying again may work). */
  readonly pickFailed: boolean;
  readonly pick: () => void;
  readonly retry: () => void;
  readonly dismissSettled: () => void;
}

export function useAlbumUpload(tripId: string): AlbumUploadView {
  const { commands } = useLocalFirst();
  const queue = albumUploadQueue(commands);
  const items = useSyncExternalStore(queue.subscribe, queue.items);
  const online = useOnline();
  const [pickFailed, setPickFailed] = useState(false);
  const shas = useLiveRows<{ sha256: string }>(SHAS_SQL, [tripId], ['photos']).rows;
  const known = useMemo(() => new Set(shas.map((row) => row.sha256)), [shas]);

  useEffect(() => {
    if (online) queue.resume(known);
    // Only a change in connectivity resumes; `known` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, queue]);

  const pick = useCallback(() => {
    setPickFailed(false);
    void pickAlbumPhotos().then((outcome) => {
      if (outcome.kind === 'picked') queue.add(tripId, outcome.photos, known);
      if (outcome.kind === 'failed') setPickFailed(true);
    });
  }, [queue, tripId, known]);

  const count = (state: UploadItem['state']) => items.filter((item) => item.state === state).length;
  return {
    items,
    uploading: count('uploading'),
    waiting: count('waiting'),
    failed: count('failed'),
    skipped: count('duplicate'),
    pickFailed,
    pick,
    retry: () => queue.resume(known, true),
    dismissSettled: () => queue.clearSettled(),
  };
}
