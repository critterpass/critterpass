/**
 * A destination's offline pack as this phone has it: the region download (map tiles and the
 * offline search index) from `useRegionPack`, plus a look at the files already on disk, so a pack
 * downloaded on an earlier run of the app still reads as downloaded, with its size, and can be
 * removed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- file paths, never copy. */
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useState } from 'react';

import { clearOfflinePlaces, getOfflineDb } from '@/data/places/offlineSearch';
import { useRegionPack } from '@/data/places/useRegionPack';

const REGIONS_DIR = 'cp-regions/';

export type OfflinePackStatus = 'checking' | 'none' | 'downloading' | 'downloaded' | 'failed';

export interface OfflinePack {
  readonly status: OfflinePackStatus;
  /** 0–1 while downloading. */
  readonly progress: number;
  readonly bytes: number | null;
  readonly download: () => void;
  readonly remove: () => void;
}

interface OnDisk {
  readonly uri: string;
  readonly bytes: number | null;
}

async function findOnDisk(slug: string): Promise<OnDisk | null> {
  const dir = `${FileSystem.documentDirectory ?? ''}${REGIONS_DIR}`;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  const name = names.find((file) => file.startsWith(`${slug}-`) && file.endsWith('.pmtiles'));
  if (name === undefined) return null;
  const uri = `${dir}${name}`;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  if (info === null || !info.exists) return null;
  return { uri, bytes: info.size };
}

export function useOfflinePack(destinationId: string, slug: string): OfflinePack {
  const pack = useRegionPack(destinationId, slug);
  const [disk, setDisk] = useState<OnDisk | null | undefined>(undefined);
  const { status } = pack;

  useEffect(() => {
    let live = true;
    void findOnDisk(slug).then((found) => {
      if (live) setDisk(found);
    });
    return () => {
      live = false;
    };
    // Looked at again whenever a download finishes or a pack is removed.
  }, [slug, status]);

  const remove = useCallback(() => {
    void (async () => {
      await pack.remove();
      if (disk !== null && disk !== undefined) {
        await FileSystem.deleteAsync(disk.uri, { idempotent: true });
        await clearOfflinePlaces(await getOfflineDb(), destinationId);
      }
      setDisk(null);
    })();
  }, [destinationId, disk, pack]);

  const onDisk = disk !== null && disk !== undefined;
  return {
    status:
      status === 'downloading'
        ? 'downloading'
        : status === 'downloaded' || onDisk
          ? 'downloaded'
          : status === 'error'
            ? 'failed'
            : disk === undefined
              ? 'checking'
              : 'none',
    progress: pack.progress,
    bytes: pack.bytes ?? disk?.bytes ?? null,
    download: () => void pack.download(),
    remove,
  };
}

/** The region files on this phone, by file name; read again whenever `refreshKey` changes. */
export function useOfflinePackFiles(refreshKey: unknown = null): readonly string[] {
  const [files, setFiles] = useState<readonly string[]>([]);
  useEffect(() => {
    let live = true;
    void FileSystem.readDirectoryAsync(`${FileSystem.documentDirectory ?? ''}${REGIONS_DIR}`)
      .catch(() => [] as string[])
      .then((names) => {
        if (live) setFiles(names);
      });
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return files;
}
