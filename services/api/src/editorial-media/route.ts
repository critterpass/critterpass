/**
 * `GET /v1/media?subjects=destination:da-nang,poi:<ref>`: the ready editorial media (licensed stock
 * stills and video loops) for up to 20 subjects, hero first per subject. Files are public, immutable
 * objects under the media Worker's `c/` prefix, so each URL is absolute and never expires; the app
 * caches them and prefetches a trip's to disk. Every item carries its credit and licence.
 */
import { withUser } from '@cp/db';
import {
  DomainError,
  mediaSubjectKeySchema,
  type MediaAsset,
  type MediaListResponse,
  type MediaVariant,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export interface EditorialMediaDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  /** Origin of the media Worker, e.g. `https://media.critterpass.app`. */
  readonly publicBaseUrl: string;
}

const querySchema = z.object({
  subjects: z
    .string()
    .transform((value) => [...new Set(value.split(',').map((s) => s.trim()))])
    .pipe(z.array(mediaSubjectKeySchema).min(1).max(20)),
});

interface AssetRow {
  id: string;
  kind: 'photo' | 'video';
  subject_keys: string[];
  rank: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  colour: string | null;
  blurhash: string;
  variants: MediaVariant[];
  credit: string;
  attribution_required: boolean;
  author: string;
  source: MediaAsset['source'];
  source_url: string;
  licence: string;
  licence_url: string;
}

export async function readEditorialMedia(
  tx: pg.PoolClient,
  subjects: readonly string[],
  publicBaseUrl: string,
): Promise<MediaListResponse> {
  const { rows } = await tx.query<AssetRow>(
    `SELECT id, kind, subject_keys, rank, width, height, duration_ms, colour, blurhash, variants,
            credit, attribution_required, author, source, source_url, licence, licence_url
       FROM media_assets
      WHERE status = 'ready' AND subject_keys && $1::text[]
      ORDER BY rank, kind, id`,
    [subjects],
  );
  const base = publicBaseUrl.replace(/\/+$/u, '');
  const url = (key: string) => `${base}/${key}`;
  const byWidth = (a: MediaVariant, b: MediaVariant) => a.w - b.w;
  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      subjects: row.subject_keys.filter((key) => subjects.includes(key)),
      rank: row.rank,
      width: row.width,
      height: row.height,
      duration_ms: row.duration_ms,
      colour: row.colour,
      blurhash: row.blurhash,
      images: row.variants
        .filter((v) => v.format === 'webp')
        .sort(byWidth)
        .map((v) => ({ url: url(v.key), w: v.w, h: v.h })),
      videos: row.variants
        .filter((v) => v.format === 'mp4')
        .sort(byWidth)
        .map((v) => ({ url: url(v.key), w: v.w, h: v.h, bytes: v.bytes })),
      credit: row.credit,
      attribution_required: row.attribution_required,
      author: row.author,
      source: row.source,
      source_url: row.source_url,
      licence: row.licence,
      licence_url: row.licence_url,
    })),
  };
}

export function registerEditorialMediaRoute(
  app: OpenAPIHono<AppEnv>,
  deps: EditorialMediaDeps,
): void {
  app.get('/v1/media', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { field: 'subjects' });
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readEditorialMedia(tx, parsed.data.subjects, deps.publicBaseUrl),
    );
    c.header('Cache-Control', 'private, max-age=3600');
    return c.json(body);
  });
}
