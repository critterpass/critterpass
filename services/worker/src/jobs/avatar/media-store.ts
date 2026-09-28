/**
 * The media bucket (R2, S3 API) as the avatar jobs see it: read an upload, write a rendered PNG,
 * move a blocked upload into quarantine. Requests are signed with aws4fetch (SigV4); the same
 * bucket and credentials as the api's media routes (docs/api-contracts.md §5.4).
 */
import { AwsClient } from 'aws4fetch';

export interface MediaStoreConfig {
  /** `https://<account>.r2.cloudflarestorage.com` */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
}

export interface AvatarMediaStore {
  /** The object, or null when nothing is stored at `key` (yet). */
  get(key: string): Promise<StoredObject | null>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Blocked uploads leave the served key space; only ops (and a legal hold) can reach them. */
export function quarantineKey(mediaKey: string): string {
  return `quarantine/${mediaKey}`;
}

export function createAvatarMediaStore(config: MediaStoreConfig): AvatarMediaStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `${config.endpoint.replace(/\/+$/u, '')}/${encodeURIComponent(config.bucket)}`;
  const url = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async function failed(response: Response, what: string): Promise<never> {
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`media store ${what} failed: HTTP ${response.status} ${detail}`);
  }

  return {
    async get(key) {
      const response = await client.fetch(url(key), { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok) return failed(response, 'get');
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type'),
      };
    },
    async put(key, bytes, contentType) {
      const response = await client.fetch(url(key), {
        method: 'PUT',
        body: Buffer.from(bytes),
        headers: { 'content-type': contentType },
      });
      if (!response.ok) await failed(response, 'put');
    },
    async delete(key) {
      const response = await client.fetch(url(key), { method: 'DELETE' });
      if (!response.ok && response.status !== 404) await failed(response, 'delete');
    },
  };
}
