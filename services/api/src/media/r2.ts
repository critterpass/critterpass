/**
 * R2 through its S3-compatible API (SigV4 via aws4fetch): presigned single PUTs and upload parts
 * for clients, plus the few server-side calls multipart needs (create, complete, abort) and a
 * HEAD/DELETE to check what actually landed. Path-style URLs (`<endpoint>/<bucket>/<key>`) work
 * for R2 and for any S3-compatible store used in tests.
 */
import { AwsClient } from 'aws4fetch';

export interface R2Config {
  /** `https://<account id>.r2.cloudflarestorage.com` */
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** A non-2xx S3 response (or a 200 carrying an `<Error>` body, which CompleteMultipartUpload may send). */
export class R2RequestError extends Error {
  readonly status: number;
  readonly s3Code: string | undefined;

  constructor(operation: string, status: number, s3Code: string | undefined) {
    super(`R2 ${operation} failed with ${status}${s3Code !== undefined ? ` ${s3Code}` : ''}`);
    this.name = 'R2RequestError';
    this.status = status;
    this.s3Code = s3Code;
  }
}

export interface PresignPutInput {
  readonly key: string;
  readonly contentType: string;
  readonly bytes: number;
  /** Base64 SHA-256 of the body; R2 rejects a body that does not match it. */
  readonly sha256Base64: string;
  readonly expiresInSeconds: number;
}

export interface PresignPartInput {
  readonly key: string;
  readonly uploadId: string;
  readonly partNumber: number;
  readonly expiresInSeconds: number;
}

export interface CompletedPart {
  readonly partNumber: number;
  readonly etag: string;
}

export interface R2ObjectHead {
  readonly bytes: number;
  readonly contentType: string | undefined;
}

export interface R2Client {
  presignPut(input: PresignPutInput): Promise<string>;
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  presignUploadPart(input: PresignPartInput): Promise<string>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly CompletedPart[],
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  headObject(key: string): Promise<R2ObjectHead | undefined>;
  deleteObject(key: string): Promise<void>;
}

const REQUEST_TIMEOUT_MS = 10_000;

function xmlValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  if (match?.[1] === undefined) return undefined;
  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function createR2Client(config: R2Config): R2Client {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const objectUrl = (key: string): string =>
    `${config.endpoint.replace(/\/+$/, '')}/${config.bucket}/${encodeKey(key)}`;

  async function send(operation: string, url: string, init: RequestInit): Promise<string> {
    const response = await aws.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok || body.includes('<Error>')) {
      throw new R2RequestError(operation, response.status, xmlValue(body, 'Code'));
    }
    return body;
  }

  async function presign(
    url: string,
    method: string,
    headers: Record<string, string>,
    expiresInSeconds: number,
  ): Promise<string> {
    const separator = url.includes('?') ? '&' : '?';
    const signed = await aws.sign(
      new Request(`${url}${separator}X-Amz-Expires=${expiresInSeconds}`, { method, headers }),
      { aws: { signQuery: true, allHeaders: true } },
    );
    return signed.url;
  }

  return {
    presignPut(input) {
      // Every header here is signed: the client must send exactly this type, length and
      // checksum, so the object at this key can only ever be the declared bytes.
      return presign(
        objectUrl(input.key),
        'PUT',
        {
          'content-type': input.contentType,
          'content-length': String(input.bytes),
          'x-amz-checksum-sha256': input.sha256Base64,
        },
        input.expiresInSeconds,
      );
    },

    async createMultipartUpload(key, contentType) {
      const body = await send('CreateMultipartUpload', `${objectUrl(key)}?uploads`, {
        method: 'POST',
        headers: { 'content-type': contentType },
      });
      const uploadId = xmlValue(body, 'UploadId');
      if (uploadId === undefined) {
        throw new R2RequestError('CreateMultipartUpload', 200, 'MissingUploadId');
      }
      return uploadId;
    },

    presignUploadPart(input) {
      const url = `${objectUrl(input.key)}?partNumber=${input.partNumber}&uploadId=${encodeURIComponent(input.uploadId)}`;
      return presign(url, 'PUT', {}, input.expiresInSeconds);
    },

    async completeMultipartUpload(key, uploadId, parts) {
      const xml = `<CompleteMultipartUpload>${parts
        .map(
          (part) =>
            `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`,
        )
        .join('')}</CompleteMultipartUpload>`;
      await send(
        'CompleteMultipartUpload',
        `${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`,
        { method: 'POST', headers: { 'content-type': 'application/xml' }, body: xml },
      );
    },

    async abortMultipartUpload(key, uploadId) {
      await send(
        'AbortMultipartUpload',
        `${objectUrl(key)}?uploadId=${encodeURIComponent(uploadId)}`,
        { method: 'DELETE' },
      );
    },

    async headObject(key) {
      const response = await aws.fetch(objectUrl(key), {
        method: 'HEAD',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 404) return undefined;
      if (!response.ok) throw new R2RequestError('HeadObject', response.status, undefined);
      return {
        bytes: Number(response.headers.get('content-length') ?? '0'),
        contentType: response.headers.get('content-type') ?? undefined,
      };
    },

    async deleteObject(key) {
      await send('DeleteObject', objectUrl(key), { method: 'DELETE' });
    },
  };
}
