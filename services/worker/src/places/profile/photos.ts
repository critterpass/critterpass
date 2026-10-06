/**
 * A place profile's photos: up to three found by an image search on the place's local name and
 * town, downloaded, resized to 480 px wide JPEG and stored in the media bucket under the public
 * `c/place-profiles/<poi id>/` prefix, each with the page it was found on. No photo address a
 * model wrote is ever used; a photo that will not download or decode is skipped.
 */
import sharp from 'sharp';

import type { AvatarMediaStore } from '../../jobs/avatar/media-store';
import { USER_AGENT } from './pages';
import type { ImageHit } from './search';

export const PHOTO_WIDTH = 480;
export const MAX_PHOTOS = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Thumbnails and icons smaller than this are not worth showing. */
const MIN_SOURCE_WIDTH = 300;

export interface StoredPhoto {
  readonly key: string;
  readonly source_page: string;
  readonly engine: string | null;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

export function photoKey(poiId: string, n: number): string {
  return `c/place-profiles/${poiId}/${n}.jpg`;
}

async function download(
  src: string,
  send: typeof fetch,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const timeout = AbortSignal.timeout(10_000);
  const response = await send(src, {
    headers: { 'user-agent': USER_AGENT, accept: 'image/*' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) return null;
  if (!(response.headers.get('content-type') ?? '').startsWith('image/')) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.byteLength > MAX_IMAGE_BYTES ? null : bytes;
}

/** Resized JPEG, or null when the image is too small to use. */
export async function resizePhoto(
  source: Buffer,
): Promise<{ bytes: Buffer; width: number; height: number } | null> {
  const meta = await sharp(source).metadata();
  if ((meta.width ?? 0) < MIN_SOURCE_WIDTH) return null;
  const { data, info } = await sharp(source)
    .rotate()
    .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

export async function storePhotos(
  poiId: string,
  hits: readonly ImageHit[],
  deps: {
    readonly store: Pick<AvatarMediaStore, 'put'>;
    readonly fetch?: typeof fetch;
    readonly signal?: AbortSignal;
  },
): Promise<StoredPhoto[]> {
  const send = deps.fetch ?? fetch;
  const kept: StoredPhoto[] = [];
  const pages = new Set<string>();
  for (const hit of hits.slice(0, 12)) {
    if (kept.length >= MAX_PHOTOS) break;
    // One photo per source page: three angles from three pages beat three crops of one.
    if (pages.has(hit.sourcePage)) continue;
    try {
      const raw = await download(hit.src, send, deps.signal);
      const photo = raw === null ? null : await resizePhoto(raw);
      if (photo === null) continue;
      const key = photoKey(poiId, kept.length + 1);
      await deps.store.put(key, photo.bytes, 'image/jpeg');
      pages.add(hit.sourcePage);
      kept.push({
        key,
        source_page: hit.sourcePage,
        engine: hit.engine,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes.byteLength,
      });
    } catch {
      deps.signal?.throwIfAborted();
      // A photo that will not download, decode or store is skipped.
    }
  }
  return kept;
}
