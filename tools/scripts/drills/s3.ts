/**
 * Just enough S3 (R2) for the drills: list a prefix with sizes and stream one object to a file,
 * signed with AWS Signature V4. Reads the same `BACKUP_S3_*` variables as the worker's backup job.
 */
import { createHash, createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface S3Config {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
}

export interface S3Object {
  readonly key: string;
  readonly size: number;
}

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

/** RFC 3986 encoding as SigV4 wants it (keeps `/` when asked). */
function encode(value: string, keepSlash = false): string {
  const out = encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? out.replaceAll('%2F', '/') : out;
}

/** Signs a GET with path-style addressing; returns the URL and headers. */
export function signGet(
  config: S3Config,
  key: string,
  query: Readonly<Record<string, string>>,
  now: Date,
): { url: string; headers: Record<string, string> } {
  const endpoint = new URL(config.endpoint);
  const path = `/${encode(config.bucket)}${key ? `/${encode(key, true)}` : ''}`;
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encode(name)}=${encode(query[name] ?? '')}`)
    .join('&');
  const amzDate = now
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: endpoint.host,
    'x-amz-content-sha256': EMPTY_SHA256,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonical = [
    'GET',
    path,
    canonicalQuery,
    ...Object.keys(headers)
      .sort()
      .map((name) => `${name}:${headers[name] ?? ''}`),
    '',
    signedHeaders,
    EMPTY_SHA256,
  ].join('\n');
  const scope = `${day}/${config.region}/s3/aws4_request`;
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonical).digest('hex'),
  ].join('\n');
  const signingKey = ['s3', 'aws4_request'].reduce<Buffer>(
    (k, part) => hmac(k, part),
    hmac(hmac(`AWS4${config.secretAccessKey}`, day), config.region),
  );
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `${endpoint.origin}${path}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  return { url, headers };
}

function xmlValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'gu'))].map((m) => m[1] ?? '');
}

export async function listObjects(config: S3Config, prefix: string): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = { 'list-type': '2', prefix };
    if (token) query['continuation-token'] = token;
    const { url, headers } = signGet(config, '', query, new Date());
    const response = await fetch(url, { headers });
    const xml = await response.text();
    if (!response.ok) throw new Error(`list ${prefix} failed: ${response.status}`);
    for (const block of xml.split('<Contents>').slice(1)) {
      objects.push({
        key: xmlValues(block, 'Key')[0] ?? '',
        size: Number(xmlValues(block, 'Size')[0]),
      });
    }
    token = xml.includes('<IsTruncated>true</IsTruncated>')
      ? xmlValues(xml, 'NextContinuationToken')[0]
      : undefined;
  } while (token);
  return objects;
}

export async function downloadObject(config: S3Config, key: string, file: string): Promise<void> {
  const { url, headers } = signGet(config, key, {}, new Date());
  const response = await fetch(url, { headers });
  if (!response.ok || !response.body) throw new Error(`get ${key} failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config {
  const need = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    endpoint: need('BACKUP_S3_ENDPOINT'),
    bucket: need('BACKUP_S3_BUCKET'),
    accessKeyId: need('BACKUP_S3_ACCESS_KEY_ID'),
    secretAccessKey: need('BACKUP_S3_SECRET_ACCESS_KEY'),
    region: env.BACKUP_S3_REGION || 'auto',
  };
}
