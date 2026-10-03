/**
 * Add from a link or a screenshot (docs/api-contracts-planning.md, imports): the server reads a
 * post or OCR text, matches the places it mentions and streams them back as server-sent events.
 * Nothing from the post is stored: titles, captions and OCR lines live only in the request, and an
 * idea saved from it keeps only the URL. Copy names what was read ("I read the post"), so
 * `source.read` says whether a video was actually analysed.
 */
import { z } from 'zod';

import { poiCategorySchema } from '../places/categories';
import { fitGradeSchema } from './fit';

export const IMPORT_PLATFORMS = [
  'tiktok',
  'youtube',
  'instagram',
  'apple_maps',
  'google_maps',
  'screenshot',
  'web',
] as const;
export const importPlatformSchema = z.enum(IMPORT_PLATFORMS);
export type ImportPlatform = z.infer<typeof importPlatformSchema>;

/** What the server actually read, so copy never claims more than that. */
export const IMPORT_READS = ['post_text', 'video', 'map_link', 'ocr_text'] as const;

export const importRequestSchema = z.union([
  z.strictObject({ url: z.url().max(2048) }),
  z.strictObject({ text: z.string().trim().min(1).max(8000), kind: z.literal('screenshot') }),
]);
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importCandidateSchema = z.strictObject({
  poi_id: z.uuid(),
  name: z.string().min(1).max(120),
  category: poiCategorySchema,
  /** The area or street line shown under the name. */
  meta: z.string().max(120).nullable(),
  fit_best: z
    .strictObject({ day_no: z.number().int().min(1), grade: fitGradeSchema })
    .nullable()
    .optional(),
});
export type ImportCandidate = z.infer<typeof importCandidateSchema>;

export const IMPORT_ERROR_CODES = [
  'unsupported_link',
  'unreadable',
  'not_found',
  'rate_limited',
  'busy',
] as const;

export const importEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('source'),
    data: z.strictObject({
      platform: importPlatformSchema,
      read: z.enum(IMPORT_READS),
      title: z.string().max(300).nullable().optional(),
      author: z.string().max(120).nullable().optional(),
      thumb_url: z.url().nullable().optional(),
    }),
  }),
  z.strictObject({
    event: z.literal('match'),
    data: importCandidateSchema.extend({ label: z.string().min(1).max(120) }),
  }),
  z.strictObject({
    event: z.literal('ambiguous'),
    data: z.strictObject({
      label: z.string().min(1).max(120),
      candidates: z.array(importCandidateSchema).min(2).max(3),
    }),
  }),
  z.strictObject({
    event: z.literal('unknown'),
    data: z.strictObject({ label: z.string().min(1).max(120) }),
  }),
  z.strictObject({
    event: z.literal('done'),
    data: z.strictObject({
      matched: z.number().int().min(0),
      ambiguous: z.number().int().min(0),
      unknown: z.number().int().min(0),
    }),
  }),
  z.strictObject({
    event: z.literal('error'),
    data: z.strictObject({ code: z.enum(IMPORT_ERROR_CODES) }),
  }),
]);
export type ImportEvent = z.infer<typeof importEventSchema>;
