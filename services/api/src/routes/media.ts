/**
 * Media upload and read primitives (docs/api-contracts.md §5.4): presigned single PUTs (≤5 MB),
 * multipart for larger originals, and HMAC-signed read URLs served by the media Worker. Uploads
 * register a `media_objects` row through the internal `register_media_upload` command; read URLs
 * are minted only for objects the caller owns or that belong to a trip they are a member of.
 */
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { validationHook } from '../commands/_framework/doors';
import type { CommandRegistry } from '../commands/_framework/registry';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import {
  multipartCompleteRoute,
  multipartCreateRoute,
  multipartPartsRoute,
  presignRoute,
  readUrlsRoute,
} from '../media/openapi-routes';
import {
  assertUploadAllowed,
  MULTIPART_PART_BYTES,
  newMediaKey,
  parseMediaKey,
  SINGLE_PUT_MAX_BYTES,
} from '../media/purposes';
import { R2RequestError, type R2Client } from '../media/r2';
import { authorizeReads } from '../media/read-access';
import { registerMediaUpload } from '../media/register-media-upload';
import { mintReadUrl, READ_URL_TTL_SECONDS, type MediaSigningConfig } from '../media/sign';

export interface MediaRouteDeps {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly r2: R2Client;
  readonly signing: MediaSigningConfig;
  readonly now?: () => number;
}

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const MEDIA_PER_UID_RULE = { windowSeconds: 60, max: 120 };

function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

/** The caller's own key, or `NOT_FOUND`: never confirm another user's key exists. */
function ownKey(key: string, uid: string) {
  const parsed = parseMediaKey(key);
  if (parsed === undefined || parsed.ownerId !== uid) throw new DomainError('NOT_FOUND');
  return parsed;
}

/** Maps what R2 says about a client-driven multipart call to the wire error it stands for. */
function multipartFailure(error: unknown): never {
  if (error instanceof R2RequestError && error.status >= 400 && error.status < 500) {
    if (error.s3Code === 'NoSuchUpload') throw new DomainError('NOT_FOUND');
    throw new DomainError('VALIDATION', { reason: 'multipart_rejected', s3_code: error.s3Code });
  }
  throw error;
}

export function registerMediaRoutes(app: OpenAPIHono<AppEnv>, deps: MediaRouteDeps): void {
  const nowSeconds = () => Math.floor((deps.now ?? Date.now)() / 1000);
  const session = async (headers: Headers) => {
    const active = await requireCommandSession(deps.sessions, headers);
    await enforceUidRateLimit(deps.redis, 'media', active.uid, MEDIA_PER_UID_RULE);
    return active;
  };

  app.openapi(
    presignRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers);
      const body = c.req.valid('json');
      assertUploadAllowed(body.purpose, body.content_type, body.bytes);
      if (body.bytes > SINGLE_PUT_MAX_BYTES) {
        throw new DomainError('PAYLOAD_TOO_LARGE', {
          max_bytes: SINGLE_PUT_MAX_BYTES,
          use: 'multipart',
        });
      }

      const mediaKey = newMediaKey(uid, body.purpose);
      const checksum = hexToBase64(body.sha256);
      const putUrl = await deps.r2.presignPut({
        key: mediaKey,
        contentType: body.content_type,
        bytes: body.bytes,
        sha256Base64: checksum,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      });
      // Registered now: the signed length and checksum mean nothing but these bytes can ever
      // land at this key, and the client never has to call back after its PUT.
      await registerMediaUpload(deps, uid, {
        media_key: mediaKey,
        content_type: body.content_type,
        bytes: body.bytes,
        sha256: body.sha256,
      });

      return c.json(
        {
          media_key: mediaKey,
          put_url: putUrl,
          headers: {
            'content-type': body.content_type,
            'x-amz-checksum-sha256': checksum,
          },
          expires_at: new Date((nowSeconds() + UPLOAD_URL_TTL_SECONDS) * 1000).toISOString(),
        },
        200,
      );
    },
    validationHook,
  );

  app.openapi(
    multipartCreateRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers);
      const body = c.req.valid('json');
      assertUploadAllowed(body.purpose, body.content_type, body.bytes);

      const mediaKey = newMediaKey(uid, body.purpose);
      const uploadId = await deps.r2.createMultipartUpload(mediaKey, body.content_type);
      return c.json(
        {
          media_key: mediaKey,
          upload_id: uploadId,
          part_bytes: MULTIPART_PART_BYTES,
          part_count: Math.ceil(body.bytes / MULTIPART_PART_BYTES),
        },
        200,
      );
    },
    validationHook,
  );

  app.openapi(
    multipartPartsRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers);
      const { key } = c.req.valid('param');
      const body = c.req.valid('json');
      ownKey(key, uid);

      const parts = await Promise.all(
        body.part_numbers.map(async (partNumber) => ({
          part_number: partNumber,
          url: await deps.r2.presignUploadPart({
            key,
            uploadId: body.upload_id,
            partNumber,
            expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
          }),
        })),
      );
      return c.json(
        {
          parts,
          expires_at: new Date((nowSeconds() + UPLOAD_URL_TTL_SECONDS) * 1000).toISOString(),
        },
        200,
      );
    },
    validationHook,
  );

  app.openapi(
    multipartCompleteRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers);
      const { key } = c.req.valid('param');
      const body = c.req.valid('json');
      const parsed = ownKey(key, uid);

      const parts = [...body.parts]
        .sort((a, b) => a.part_number - b.part_number)
        .map((part) => ({ partNumber: part.part_number, etag: part.etag }));
      await deps.r2.completeMultipartUpload(key, body.upload_id, parts).catch(multipartFailure);

      const head = await deps.r2.headObject(key);
      if (head === undefined) throw new DomainError('NOT_FOUND');
      try {
        assertUploadAllowed(parsed.purpose, head.contentType ?? '', head.bytes);
      } catch (error) {
        // What landed breaks the purpose's rules (the parts are not size-signed): remove it
        // rather than leave an unregistered object behind.
        await deps.r2.deleteObject(key);
        throw error;
      }

      await registerMediaUpload(deps, uid, {
        media_key: key,
        content_type: head.contentType ?? 'application/octet-stream',
        bytes: head.bytes,
        sha256: body.sha256,
      });
      return c.json({ media_key: key, bytes: head.bytes }, 200);
    },
    validationHook,
  );

  app.openapi(
    readUrlsRoute,
    async (c) => {
      const { uid } = await session(c.req.raw.headers);
      const { media_keys: keys } = c.req.valid('json');
      if (!(await authorizeReads(deps.pool, uid, keys))) throw new DomainError('NOT_FOUND');

      const expiresAt = nowSeconds() + READ_URL_TTL_SECONDS;
      const urls = await Promise.all(
        keys.map(async (key) => ({
          media_key: key,
          url: await mintReadUrl(deps.signing, key, expiresAt),
        })),
      );
      return c.json({ urls, expires_at: new Date(expiresAt * 1000).toISOString() }, 200);
    },
    validationHook,
  );
}
