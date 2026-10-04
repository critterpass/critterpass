/**
 * `media.ingest`: stores one published stock asset in the media bucket. It downloads the file the
 * content batch named, or for a Mapillary image the file its id names today (source-url.ts)
 * (sources forbid permanent hotlinking, and the app caches these offline),
 * writes the stills (and a video's loops) under the public `c/media/<id>/` prefix, and marks the
 * row ready with its blurhash, colour and variant list. A file that cannot be decoded is marked
 * failed and not retried; a network or bucket error is retried.
 */
import { withSystem } from '@cp/db';
import { MEDIA_INGEST_QUEUE, mediaIngestPayloadSchema, type MediaVariant } from '@cp/domain';

import { defineJob, type JobDefinition } from '../../boss';
import type { AvatarMediaStore } from '../avatar/media-store';
import {
  processStill,
  processVideo,
  type EncodedFile,
  type ProcessedStill,
  type ProcessedVideo,
} from './process';
import { downloadUrl, UnusableMediaError } from './source-url';

export { UnusableMediaError };

export const MAX_DOWNLOAD_BYTES = 120 * 1024 * 1024;
const USER_AGENT = 'CritterPass-media-ingest/1.0 (https://critterpass.app)';

export interface MediaIngestOptions {
  readonly store: AvatarMediaStore;
  readonly fetch?: typeof fetch;
  /** Asks Mapillary for an image's current file link (its links expire). */
  readonly mapillaryToken?: string | undefined;
  readonly ffmpeg?: string;
  readonly ffprobe?: string;
}

interface AssetRow {
  id: string;
  kind: 'photo' | 'video';
  source: string;
  source_id: string;
  download_url: string;
  status: string;
}

async function download(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      throw new UnusableMediaError(`source file is gone (HTTP ${response.status})`);
    }
    throw new Error(`download failed: HTTP ${response.status}`);
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new UnusableMediaError(`source file is ${length} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new UnusableMediaError(`source file is ${bytes.byteLength} bytes`);
  }
  return bytes;
}

export const mediaKey = (assetId: string, name: string) => `c/media/${assetId}/${name}`;

async function upload(
  store: AvatarMediaStore,
  assetId: string,
  files: readonly EncodedFile[],
  format: 'webp' | 'mp4',
): Promise<MediaVariant[]> {
  const variants: MediaVariant[] = [];
  for (const file of files) {
    const key = mediaKey(assetId, `${file.w}.${format}`);
    await store.put(key, file.bytes, format === 'webp' ? 'image/webp' : 'video/mp4');
    variants.push({ key, format, w: file.w, h: file.h, bytes: file.bytes.byteLength });
  }
  return variants;
}

export async function ingestAsset(
  pool: Parameters<typeof withSystem>[0],
  assetId: string,
  options: MediaIngestOptions,
): Promise<{ status: string; variants?: number }> {
  const asset = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<AssetRow>(
      'SELECT id, kind, source, source_id, download_url, status FROM media_assets WHERE id = $1',
      [assetId],
    );
    return rows[0];
  });
  if (asset === undefined) return { status: 'gone' };
  if (asset.status === 'ready') return { status: 'ready' };
  try {
    const fetchImpl = options.fetch ?? fetch;
    const bytes = await download(
      fetchImpl,
      await downloadUrl(fetchImpl, asset, options.mapillaryToken),
    );
    let processed: ProcessedStill;
    let loops: readonly EncodedFile[] = [];
    let durationMs: number | null = null;
    try {
      const video: ProcessedVideo | null =
        asset.kind === 'video'
          ? await processVideo(bytes, {
              ...(options.ffmpeg === undefined ? {} : { ffmpeg: options.ffmpeg }),
              ...(options.ffprobe === undefined ? {} : { ffprobe: options.ffprobe }),
            })
          : null;
      processed = video ?? (await processStill(bytes));
      loops = video?.loops ?? [];
      durationMs = video?.durationMs ?? null;
    } catch (error) {
      throw new UnusableMediaError(error instanceof Error ? error.message : String(error));
    }
    const variants = await upload(options.store, asset.id, processed.stills, 'webp');
    variants.push(...(await upload(options.store, asset.id, loops, 'mp4')));
    const poster =
      asset.kind === 'video' ? variants.filter((v) => v.format === 'webp').at(-1) : undefined;
    await withSystem(pool, (tx) =>
      tx.query(
        `UPDATE media_assets SET status = 'ready', error = NULL, variants = $2, blurhash = $3,
           colour = $4, width = $5, height = $6, poster_key = $7,
           duration_ms = coalesce($8, duration_ms)
         WHERE id = $1`,
        [
          asset.id,
          JSON.stringify(variants),
          processed.blurhash,
          processed.colour,
          processed.width,
          processed.height,
          poster?.key ?? null,
          durationMs,
        ],
      ),
    );
    return { status: 'ready', variants: variants.length };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const unusable = error instanceof UnusableMediaError;
    await withSystem(pool, (tx) =>
      tx.query(
        `UPDATE media_assets SET error = $2, status = CASE WHEN $3 THEN 'failed' ELSE status END
         WHERE id = $1`,
        [asset.id, message, unusable],
      ),
    );
    if (unusable) return { status: 'failed' };
    throw error;
  }
}

export function mediaIngestJob(options: MediaIngestOptions): JobDefinition<{ asset_id: string }> {
  return defineJob({
    queue: MEDIA_INGEST_QUEUE,
    schema: mediaIngestPayloadSchema,
    singletonKey: (data) => data.asset_id,
    handler: (data, ctx) => ingestAsset(ctx.pool, data.asset_id, options),
  });
}
