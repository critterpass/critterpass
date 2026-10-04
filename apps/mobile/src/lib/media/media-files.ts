/**
 * Editorial media saved on the device, under the app's own `media/<asset id>/` folder, so a trip's
 * heroes draw offline. Files never change once published (a new file is a new asset), so a saved
 * copy is always current.
 *
 * Only files of our own media Worker (`…/c/media/<asset id>/<file>`) are ever saved. An address on
 * another host (a place's Foursquare photo) is shown from the network and never copied: only its
 * id and address may be kept, and those come from the server.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { fileNameOf, type MediaView } from './variants';

const ROOT = 'media';

function fileFor(assetId: string, url: string): File {
  return new File(Paths.document, ROOT, assetId, fileNameOf(url));
}

const OWN_MEDIA_FILE = /\/c\/media\/[0-9a-f-]{36}\/[^/?#]+$/u;

/** Whether a file may be saved on the device: one of our own published media files. */
export function isSavableMediaUrl(url: string): boolean {
  return OWN_MEDIA_FILE.test(url);
}

/** The saved copy's URI, or null when this file was never saved. */
export function savedMediaUri(assetId: string, url: string): string | null {
  if (!isSavableMediaUrl(url)) return null;
  try {
    const file = fileFor(assetId, url);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Saves one file of an asset; resolves to its URI, or null when the download failed or the file is
 * not ours to keep.
 */
export async function saveMediaFile(assetId: string, url: string): Promise<string | null> {
  if (!isSavableMediaUrl(url)) return null;
  try {
    const dir = new Directory(Paths.document, ROOT, assetId);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = fileFor(assetId, url);
    if (target.exists) return target.uri;
    return (await File.downloadFileAsync(url, target, { idempotent: true })).uri;
  } catch {
    return null;
  }
}

/**
 * The saved copy of `preferred`, else any saved still of the asset (a prefetched size stands in
 * offline), else null.
 */
export function savedStillUri(media: MediaView, preferred: string): string | null {
  const exact = savedMediaUri(media.id, preferred);
  if (exact !== null) return exact;
  for (const image of [...media.images].reverse()) {
    const uri = savedMediaUri(media.id, image.url);
    if (uri !== null) return uri;
  }
  return null;
}
