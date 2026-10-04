/**
 * Editorial media (licensed stock photos and muted video loops) as the content factory proposes
 * them, the ops console reviews them and the app reads them. A candidate names its source, licence
 * and credit; a published asset adds the files the ingest job stored under `c/media/<id>/`.
 */
import { z } from 'zod';

export const MEDIA_KINDS = ['photo', 'video'] as const;
/**
 * Where a proposed asset comes from: the stock libraries, Wikimedia Commons, and Mapillary's
 * street-level photos (a place's last resort before its category tile).
 */
export const MEDIA_SOURCES = ['pexels', 'pixabay', 'wikimedia', 'mapillary'] as const;
/** Sources whose photo of a place is a picture of the kind of thing, never of the place itself. */
export const STOCK_MEDIA_SOURCES: readonly string[] = ['pexels', 'pixabay'];
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export const mediaSourceSchema = z.enum(MEDIA_SOURCES);
export type MediaKind = z.infer<typeof mediaKindSchema>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;

/** `destination:<slug>` or `poi:<ref>`: what an asset shows. */
export const mediaSubjectKeySchema = z
  .string()
  .regex(/^(destination|poi):[a-z0-9-]+$/u, 'must look like destination:da-nang');

export function destinationSubject(slug: string): string {
  return `destination:${slug}`;
}

const httpsUrl = z.url().regex(/^https:\/\//u, 'must be https');

/** One proposed asset in a `media` content release (the ops console keeps or rejects it). */
export const mediaCandidateSchema = z
  .object({
    /** `<source>-<kind>-<source id>`, stable across batches. */
    id: z
      .string()
      .regex(/^(pexels|pixabay|wikimedia|mapillary)-(photo|video)-[A-Za-z0-9._-]{1,160}$/u),
    kind: mediaKindSchema,
    source: mediaSourceSchema,
    source_id: z.string().min(1).max(200),
    source_url: httpsUrl,
    download_url: httpsUrl,
    /** What the reviewer looks at: a small still (a video's thumbnail). */
    preview_url: httpsUrl,
    subjects: z.array(mediaSubjectKeySchema).min(1).max(20),
    rank: z.number().int().min(0).max(99),
    title: z.string().max(300).nullable(),
    author: z.string().min(1).max(200),
    author_url: z.url().nullable(),
    licence: z.string().regex(/^[a-z0-9.-]{2,40}$/u),
    licence_url: z.url(),
    attribution_required: z.boolean(),
    credit: z.string().min(1).max(300),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration_ms: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((item) => item.id === `${item.source}-${item.kind}-${item.source_id}`, {
    message: 'id must be <source>-<kind>-<source_id>',
  })
  .refine((item) => (item.kind === 'video') === (item.duration_ms !== null), {
    message: 'a video has a duration and a photo has none',
  });
export type MediaCandidate = z.infer<typeof mediaCandidateSchema>;

export const mediaVariantSchema = z.object({
  /** Object key under the public prefix: `c/media/<asset id>/<w>.webp`. */
  key: z.string().regex(/^c\/media\/[0-9a-f-]{36}\/[a-z0-9-]+\.(webp|mp4)$/u),
  format: z.enum(['webp', 'mp4']),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  bytes: z.number().int().positive(),
});
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

/** `GET /v1/media` item: a ready asset with absolute file URLs. */
export const mediaAssetSchema = z.object({
  id: z.uuid(),
  kind: mediaKindSchema,
  subjects: z.array(mediaSubjectKeySchema),
  rank: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  colour: z.string().nullable(),
  blurhash: z.string(),
  /** Stills (WebP) by width, smallest first. */
  images: z.array(z.object({ url: z.url(), w: z.number().int(), h: z.number().int() })),
  /** Video loops (mp4) by width, smallest first; empty for a photo. */
  videos: z.array(
    z.object({ url: z.url(), w: z.number().int(), h: z.number().int(), bytes: z.number().int() }),
  ),
  credit: z.string(),
  attribution_required: z.boolean(),
  author: z.string(),
  /**
   * Any source the server names: an installed build reads sources added after it shipped and
   * shows them with their credit, instead of failing the whole list on one unknown value.
   */
  source: z.string().min(1),
  source_url: z.url(),
  licence: z.string(),
  licence_url: z.url(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mediaListResponseSchema = z.object({ items: z.array(mediaAssetSchema) });
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;

export const MEDIA_INGEST_QUEUE = 'media.ingest';
export const mediaIngestPayloadSchema = z.object({ asset_id: z.uuid() });
