/**
 * The few S3 API calls the backup job makes against R2 (or any S3-compatible store): multipart
 * upload of a stream in equal-size parts (R2 requires every part but the last to be the same
 * size), list by prefix, delete. Requests are signed with aws4fetch (SigV4).
 */
import { AwsClient } from 'aws4fetch';

export interface ObjectStoreConfig {
  /** e.g. `https://<account>.r2.cloudflarestorage.com`. */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** R2 uses `auto`. */
  readonly region?: string;
}

/** 16 MiB: above S3's 5 MiB part minimum, and 10 000 parts cover a 160 GiB dump. */
export const PART_SIZE = 16 * 1024 * 1024;

export interface ObjectStore {
  /** Uploads `body` to `key`; resolves to the byte count. Aborts the upload on any failure. */
  putStream(key: string, body: AsyncIterable<Uint8Array>): Promise<number>;
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

function xmlValues(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1] ?? ''));
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

async function* fixedSizeParts(
  body: AsyncIterable<Uint8Array>,
  size: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(size);
  let filled = 0;
  for await (const chunk of body) {
    let offset = 0;
    while (offset < chunk.byteLength) {
      const take = Math.min(size - filled, chunk.byteLength - offset);
      buffer.set(chunk.subarray(offset, offset + take), filled);
      filled += take;
      offset += take;
      if (filled === size) {
        yield buffer;
        buffer = new Uint8Array(size);
        filled = 0;
      }
    }
  }
  if (filled > 0) yield buffer.subarray(0, filled);
}

export function createObjectStore(
  config: ObjectStoreConfig,
  partSize: number = PART_SIZE,
): ObjectStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: config.region ?? 'auto',
  });
  const base = `${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}`;
  const objectUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async function call(url: string, init: RequestInit, what: string): Promise<Response> {
    const response = await client.fetch(url, init);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`object store ${what} failed: HTTP ${response.status} ${detail}`);
    }
    return response;
  }

  return {
    async putStream(key, body) {
      const url = objectUrl(key);
      const created = await call(`${url}?uploads`, { method: 'POST' }, 'create upload');
      const [uploadId] = xmlValues(await created.text(), 'UploadId');
      if (uploadId === undefined) throw new Error('object store returned no UploadId');
      const upload = `uploadId=${encodeURIComponent(uploadId)}`;
      const etags: string[] = [];
      let bytes = 0;
      try {
        for await (const part of fixedSizeParts(body, partSize)) {
          const number = etags.length + 1;
          const response = await call(
            `${url}?partNumber=${number}&${upload}`,
            { method: 'PUT', body: part },
            `upload part ${number}`,
          );
          const etag = response.headers.get('etag');
          if (etag === null) throw new Error(`object store returned no ETag for part ${number}`);
          etags.push(etag);
          bytes += part.byteLength;
        }
        if (etags.length === 0) throw new Error('refusing to store an empty object');
        const parts = etags
          .map(
            (etag, index) =>
              `<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`,
          )
          .join('');
        await call(
          `${url}?${upload}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/xml' },
            body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`,
          },
          'complete upload',
        );
        return bytes;
      } catch (error) {
        await client.fetch(`${url}?${upload}`, { method: 'DELETE' }).catch(() => undefined);
        throw error;
      }
    },

    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix });
        if (token !== undefined) query.set('continuation-token', token);
        const response = await call(`${base}?${query.toString()}`, { method: 'GET' }, 'list');
        const xml = await response.text();
        keys.push(...xmlValues(xml, 'Key'));
        [token] = xmlValues(xml, 'NextContinuationToken');
      } while (token !== undefined);
      return keys;
    },

    async get(key) {
      const response = await call(objectUrl(key), { method: 'GET' }, 'get');
      return new Uint8Array(await response.arrayBuffer());
    },

    async delete(key) {
      await call(objectUrl(key), { method: 'DELETE' }, 'delete');
    },
  };
}
