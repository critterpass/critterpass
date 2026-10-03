/**
 * OpenAPI route definitions for the media endpoints (docs/api-contracts.md §5.4); the handlers
 * live in ../routes/media.ts.
 */
import { createRoute, z } from '@hono/zod-openapi';

import { ErrorBodySchema } from '../commands/_framework/doors';
import { mediaPurposeSchema } from './purposes';

const MAX_PARTS_PER_REQUEST = 100;
export const MAX_PART_NUMBER = 10_000;
const MAX_READ_KEYS = 100;

const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase hex SHA-256')
  .openapi({ description: 'Lowercase hex SHA-256 of the whole object' });

const uploadRequestSchema = z.object({
  purpose: mediaPurposeSchema,
  content_type: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: sha256HexSchema,
});

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorBodySchema } },
});
const jsonBody = <T extends z.ZodType>(schema: T) => ({
  required: true as const,
  content: { 'application/json': { schema } },
});
const jsonResponse = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
});
const commonErrors = {
  401: errorResponse('AUTH_REQUIRED'),
  404: errorResponse('NOT_FOUND'),
  413: errorResponse('PAYLOAD_TOO_LARGE'),
  422: errorResponse('VALIDATION'),
  429: errorResponse('RATE_LIMITED'),
};

export const presignRoute = createRoute({
  method: 'post',
  path: '/v1/media/presign',
  tags: ['media'],
  summary: 'Presign a single PUT (≤5 MB) with a SHA-256 checksum',
  request: { body: jsonBody(uploadRequestSchema) },
  responses: {
    200: jsonResponse(
      'PUT the exact bytes to put_url with the returned headers',
      z.object({
        media_key: z.string(),
        /** The registered `media_objects` row, for commands that name a stored object. */
        media_id: z.uuid().nullable(),
        put_url: z.string(),
        headers: z.record(z.string(), z.string()),
        expires_at: z.string(),
      }),
    ),
    ...commonErrors,
  },
});

export const multipartCreateRoute = createRoute({
  method: 'post',
  path: '/v1/media/multipart',
  tags: ['media'],
  summary: 'Start a multipart upload for an original over 5 MB',
  request: { body: jsonBody(uploadRequestSchema) },
  responses: {
    200: jsonResponse(
      'Upload the parts, then complete',
      z.object({
        media_key: z.string(),
        upload_id: z.string(),
        part_bytes: z.number().int(),
        part_count: z.number().int(),
      }),
    ),
    ...commonErrors,
  },
});

const keyParams = z.object({
  key: z.string().min(1).openapi({ description: 'URL-encoded media_key' }),
});

export const multipartPartsRoute = createRoute({
  method: 'post',
  path: '/v1/media/multipart/{key}/parts',
  tags: ['media'],
  summary: 'Presign upload URLs for up to 100 parts',
  request: {
    params: keyParams,
    body: jsonBody(
      z.object({
        upload_id: z.string().min(1),
        part_numbers: z
          .array(z.number().int().min(1).max(MAX_PART_NUMBER))
          .min(1)
          .max(MAX_PARTS_PER_REQUEST),
      }),
    ),
  },
  responses: {
    200: jsonResponse(
      'One URL per requested part',
      z.object({
        parts: z.array(z.object({ part_number: z.number().int(), url: z.string() })),
        expires_at: z.string(),
      }),
    ),
    ...commonErrors,
  },
});

export const multipartCompleteRoute = createRoute({
  method: 'post',
  path: '/v1/media/multipart/{key}/complete',
  tags: ['media'],
  summary: 'Complete a multipart upload and register the object',
  request: {
    params: keyParams,
    body: jsonBody(
      z.object({
        upload_id: z.string().min(1),
        sha256: sha256HexSchema,
        parts: z
          .array(z.object({ part_number: z.number().int().min(1), etag: z.string().min(1) }))
          .min(1)
          .max(MAX_PART_NUMBER),
      }),
    ),
  },
  responses: {
    200: jsonResponse(
      'Registered',
      z.object({
        media_key: z.string(),
        media_id: z.uuid().nullable(),
        bytes: z.number().int(),
      }),
    ),
    ...commonErrors,
  },
});

export const readUrlsRoute = createRoute({
  method: 'post',
  path: '/v1/media/read-urls',
  tags: ['media'],
  summary: 'Mint signed read URLs (15 min) for objects the caller may see',
  request: {
    body: jsonBody(z.object({ media_keys: z.array(z.string().min(1)).min(1).max(MAX_READ_KEYS) })),
  },
  responses: {
    200: jsonResponse(
      'One URL per key, in request order',
      z.object({
        urls: z.array(z.object({ media_key: z.string(), url: z.string() })),
        expires_at: z.string(),
      }),
    ),
    ...commonErrors,
  },
});
