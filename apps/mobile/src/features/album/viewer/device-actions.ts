/**
 * Saving and sharing an album photo on the device: the display copy is fetched once through its
 * signed URL into the cache, then added to Photos (add-only access, never a read of the library)
 * or handed to the share sheet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- folder names and MIME types, never copy. */
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import { readUrl, type MediaHttp } from '@/features/crew';

const FOLDER = 'album';

export type DeviceActionOutcome = 'done' | 'denied' | 'failed';

async function cached(http: MediaHttp, key: string): Promise<string | null> {
  const dir = new Directory(Paths.cache, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${key.replace(/[^A-Za-z0-9._-]/gu, '_')}.jpg`);
  if (file.exists && (file.size ?? 0) > 0) return file.uri;
  const url = await readUrl(http, key);
  if (url === null) return null;
  return (await File.downloadFileAsync(url, file, { idempotent: true })).uri;
}

export async function savePhoto(http: MediaHttp, key: string): Promise<DeviceActionOutcome> {
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return 'denied';
    const uri = await cached(http, key);
    if (uri === null) return 'failed';
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'done';
  } catch {
    return 'failed';
  }
}

export async function sharePhoto(http: MediaHttp, key: string): Promise<DeviceActionOutcome> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    const uri = await cached(http, key);
    if (uri === null) return 'failed';
    await Sharing.shareAsync(uri, { mimeType: 'image/jpeg' });
    return 'done';
  } catch {
    return 'failed';
  }
}
