/**
 * The album screen's upload actions for a trip: "+ UPLOAD" (the system picker, then the queue),
 * retrying failed ones, and picking waiting ones up again as soon as the phone is back online or
 * the app is back in front. It does not follow the queue's progress: the banner does, on its own,
 * so a progress tick never redraws the grid.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useOnline } from '@/data/places/server-name-search';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLiveRows } from '@/data/powersync/live-rows';
import { feedback, toast } from '@/motion';

import { albumUploadQueue, pickAlbumPhotos } from './device-upload';

const SHAS_SQL = 'SELECT sha256 FROM photos WHERE trip_id = ? AND deleted_at IS NULL';
const TABLES = ['photos'] as const;

export interface AlbumUploadActions {
  readonly pick: () => void;
  readonly retry: () => void;
}

export function useAlbumUpload(tripId: string): AlbumUploadActions {
  const { t } = useLingui();
  const { commands } = useLocalFirst();
  const queue = albumUploadQueue(commands);
  const online = useOnline();
  const shas = useLiveRows<{ sha256: string }>(SHAS_SQL, [tripId], TABLES).rows;
  const known = useMemo(() => new Set(shas.map((row) => row.sha256)), [shas]);
  const latest = useRef(known);
  useEffect(() => {
    latest.current = known;
  }, [known]);

  // Only a change in connectivity resumes; what the album holds is read at that moment.
  useEffect(() => {
    if (online) queue.resume(latest.current);
  }, [online, queue]);

  // Back in front: transfers the system finished while the app was away are completed now.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') queue.resume(latest.current);
    });
    return () => subscription.remove();
  }, [queue]);

  const picking = useRef(false);
  const pick = useCallback(() => {
    if (picking.current) return;
    picking.current = true;
    void pickAlbumPhotos()
      .then((outcome) => {
        if (outcome.kind === 'picked') queue.add(tripId, outcome.photos, latest.current);
        if (outcome.kind === 'failed') {
          feedback.emit('error');
          toast.show({
            id: 'album-pick-failed',
            title: t({ id: 'album.upload.pickFailed', message: "Couldn't open your photos" }),
            subtitle: t({ id: 'album.upload.pickFailedLine', message: 'Try again in a moment' }),
          });
        }
      })
      .finally(() => {
        picking.current = false;
      });
  }, [queue, tripId, t]);

  const retry = useCallback(() => queue.resume(latest.current, true), [queue]);
  return useMemo(() => ({ pick, retry }), [pick, retry]);
}
