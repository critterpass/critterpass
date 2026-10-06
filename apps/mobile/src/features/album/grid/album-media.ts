/**
 * Where album tiles get their pictures: signed read URLs from the media api (minted only for a
 * traveller on the trip, 15 minutes, cached). The route provides the device's api; lab scenes
 * provide none and show each tile's colour instead.
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';

import { useReadUrl, type MediaHttp } from '@/features/crew';

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

export function useAlbumReadUrl(key: string | null): string | null {
  return useReadUrl(useContext(AlbumMediaContext), key);
}
