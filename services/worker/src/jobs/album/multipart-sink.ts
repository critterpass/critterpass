/**
 * An R2 (S3 API) multipart upload as a byte sink: bytes are buffered into parts of at least 8 MiB
 * (R2 needs 5 MiB for every part but the last), each part uploaded as it fills, so an album export
 * never holds more than one part in memory. `abort` drops the parts of an upload that failed.
 */
import { AwsClient } from 'aws4fetch';

import type { MediaStoreConfig } from '../avatar/media-store';
import type { ZipSink } from './zip';

export const PART_BYTES = 8 * 1024 * 1024;

export interface MultipartSink extends ZipSink {
  /** Uploads the last part and completes the object; resolves to its size in bytes. */
  complete(): Promise<number>;
  abort(): Promise<void>;
}

export type MultipartSinkFactory = (key: string, contentType: string) => Promise<MultipartSink>;

function tag(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([^<]*)</${name}>`, 'u').exec(xml)?.[1];
}

export function r2MultipartSinks(
  config: MediaStoreConfig,
  send: typeof fetch = fetch,
): MultipartSinkFactory {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const base = `${config.endpoint.replace(/\/+$/u, '')}/${encodeURIComponent(config.bucket)}`;
  const url = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const call = async (target: string, init: RequestInit, what: string): Promise<Response> => {
    const signed = await client.sign(target, init);
    const response = await send(signed);
    if (!response.ok) {
      throw new Error(`multipart ${what} failed: HTTP ${response.status}`);
    }
    return response;
  };

  return async (key, contentType) => {
    const created = await call(
      `${url(key)}?uploads`,
      { method: 'POST', headers: { 'content-type': contentType } },
      'create',
    );
    const uploadId = tag(await created.text(), 'UploadId');
    if (uploadId === undefined) throw new Error('multipart create returned no UploadId');
    const id = encodeURIComponent(uploadId);
    const etags: string[] = [];
    let buffered: Uint8Array[] = [];
    let size = 0;
    let total = 0;

    const flush = async () => {
      if (size === 0) return;
      const body = Buffer.concat(buffered, size);
      buffered = [];
      size = 0;
      const part = etags.length + 1;
      const response = await call(
        `${url(key)}?partNumber=${part}&uploadId=${id}`,
        { method: 'PUT', body },
        `part ${part}`,
      );
      etags.push(response.headers.get('etag') ?? '');
    };

    return {
      async write(chunk) {
        buffered.push(chunk);
        size += chunk.byteLength;
        total += chunk.byteLength;
        if (size >= PART_BYTES) await flush();
      },
      async complete() {
        await flush();
        const parts = etags
          .map((etag, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
          .join('');
        await call(
          `${url(key)}?uploadId=${id}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/xml' },
            body: `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`,
          },
          'complete',
        );
        return total;
      },
      async abort() {
        await call(`${url(key)}?uploadId=${id}`, { method: 'DELETE' }, 'abort').catch(
          () => undefined,
        );
      },
    };
  };
}
