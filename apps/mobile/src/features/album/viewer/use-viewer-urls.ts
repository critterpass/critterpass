/**
 * The viewer's pictures: a signed link for each photo's display copy, asked for together (the
 * links for one tick go out as one request). A photo whose link could not be minted is marked
 * failed, and failed ones are asked for again when the phone is back online or the traveller taps
 * "Try again".
 */
import { useCallback, useContext, useEffect, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { readUrl } from '@/features/crew';

import type { AlbumPhoto } from '../data/album-model';
import { useAlbumHttp } from '../grid/album-media';

/** By photo id: its link, `null` when it failed; absent while it is being fetched. */
export type ViewerUrls = ReadonlyMap<string, string | null>;

export interface ViewerPictures {
  readonly urls: ViewerUrls;
  readonly retry: () => void;
}

export function viewerKey(photo: AlbumPhoto): string {
  return photo.displayKey ?? photo.thumbKey ?? photo.mediaKey;
}

export function useViewerUrls(photos: readonly AlbumPhoto[]): ViewerPictures {
  const http = useAlbumHttp();
  const network = useContext(LocalFirstContext)?.network ?? null;
  const [urls, setUrls] = useState<ViewerUrls>(() => new Map());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (http === null) return undefined;
    let live = true;
    const wanted = photos.filter((photo) => typeof urls.get(photo.id) !== 'string');
    if (wanted.length === 0) return undefined;
    void Promise.all(
      wanted.map(async (photo) => [photo.id, await readUrl(http, viewerKey(photo))] as const),
    ).then((found) => {
      if (!live) return;
      setUrls((before) => {
        const next = new Map(before);
        for (const [id, url] of found) next.set(id, url);
        return next;
      });
    });
    return () => {
      live = false;
    };
    // `urls` is read, not followed: a fetch that lands must not start another.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [http, photos, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const anyFailed = [...urls.values()].some((url) => url === null);
  useEffect(() => {
    if (!anyFailed || network === null) return undefined;
    return network.subscribe((online) => {
      if (online) retry();
    });
  }, [anyFailed, network, retry]);

  return { urls, retry };
}
