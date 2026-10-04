/**
 * Where the ingest job downloads an asset from. A stock or Commons file keeps the link its batch
 * named. Mapillary's file links expire within hours, so its image's current link is asked for by
 * the image id at ingest time, with the worker's `MAPILLARY_TOKEN`.
 */
const GRAPH = 'https://graph.mapillary.com';
const NO_SUCH_OBJECT = 100;
const USER_AGENT = 'CritterPass-media-ingest/1.0 (https://critterpass.app)';

/** The source file is gone or cannot be used: the asset is marked failed, not retried. */
export class UnusableMediaError extends Error {}

export interface SourceFile {
  readonly source: string;
  readonly source_id: string;
  readonly download_url: string;
}

export async function downloadUrl(
  fetchImpl: typeof fetch,
  asset: SourceFile,
  mapillaryToken: string | undefined,
): Promise<string> {
  if (asset.source !== 'mapillary') return asset.download_url;
  // Retried once the worker has the token, never marked failed for a missing setting.
  if (mapillaryToken === undefined || mapillaryToken === '') {
    throw new Error('MAPILLARY_TOKEN is not set: a Mapillary image cannot be fetched');
  }
  if (!/^\d+$/u.test(asset.source_id)) {
    throw new UnusableMediaError(`not a Mapillary image id: ${asset.source_id}`);
  }
  const response = await fetchImpl(`${GRAPH}/${asset.source_id}?fields=thumb_2048_url`, {
    headers: { authorization: `OAuth ${mapillaryToken}`, 'user-agent': USER_AGENT },
  });
  if (response.status === 404) throw new UnusableMediaError('the Mapillary image is gone');
  const body = (await response.json().catch(() => ({}))) as {
    thumb_2048_url?: unknown;
    error?: { code?: unknown };
  };
  // An image that no longer exists answers 400 with the Graph API's "no such object" code; any
  // other refusal (a bad token, a busy service) is tried again.
  if (response.status === 400 && body.error?.code === NO_SUCH_OBJECT) {
    throw new UnusableMediaError('the Mapillary image is gone');
  }
  if (!response.ok) throw new Error(`Mapillary answered HTTP ${response.status}`);
  if (typeof body.thumb_2048_url !== 'string' || !body.thumb_2048_url.startsWith('https://')) {
    throw new UnusableMediaError('Mapillary has no file for the image');
  }
  return body.thumb_2048_url;
}
