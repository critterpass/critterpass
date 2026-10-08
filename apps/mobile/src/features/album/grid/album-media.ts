/**
 * Where album pictures come from: signed read URLs from the media api (minted only for a traveller
 * on the trip, 15 minutes, cached, so a picture keeps one URL while its link lives and the image
 * cache keeps serving it). The route provides the device's api; lab scenes provide none and show
 * each tile's colour instead. A picture whose link or file did not arrive says so and is asked for
 * again when the phone is back online.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { readUrl, type MediaHttp } from '@/features/crew';

const AlbumMediaContext = createContext<MediaHttp | null>(null);

export function AlbumMediaProvider({
  http,
  children,
}: {
  readonly http: MediaHttp | null;
  readonly children: ReactNode;
}) {
  return createElement(AlbumMediaContext.Provider, { value: http }, children);
}

export function useAlbumHttp(): MediaHttp | null {
  return useContext(AlbumMediaContext);
}

export interface AlbumPicture {
  /** Null while the link is fetched, when it failed, and where there is no media api. */
  readonly url: string | null;
  /** The link could not be minted or the file did not load. */
  readonly failed: boolean;
  /** The image view reports a file that did not load. */
  readonly onError: () => void;
  readonly retry: () => void;
}

interface Read {
  readonly key: string;
  readonly url: string | null;
  readonly failed: boolean;
}

export function useAlbumPicture(key: string | null): AlbumPicture {
  const http = useContext(AlbumMediaContext);
  const network = useContext(LocalFirstContext)?.network ?? null;
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A recycled tile never shows, or answers for, the previous key's picture.
  const mine = read !== null && read.key === key ? read : null;
  const failed = mine?.failed ?? false;

  useEffect(() => {
    if (http === null || key === null) return undefined;
    let live = true;
    void readUrl(http, key).then((url) => {
      if (live) setRead({ key, url, failed: url === null });
    });
    return () => {
      live = false;
    };
  }, [http, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!failed || network === null) return undefined;
    return network.subscribe((online) => {
      if (online) retry();
    });
  }, [failed, network, retry]);

  const onError = useCallback(() => {
    if (key !== null) setRead({ key, url: null, failed: true });
  }, [key]);

  return { url: mine?.url ?? null, failed, onError, retry };
}
