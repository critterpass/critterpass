/**
 * The editorial overlay a curated POI (`pois.editorial jsonb`) carries on top of its conflated
 * FSQ OS Places / Overture record: tips, licensed photos and a must-see flag authored by the content
 * factory. `name_local` and `tags` are their own `pois` columns, not part of this blob; this is only
 * the remaining, less structured content.
 */
import { z } from 'zod';

import { appLocaleSchema } from '../locale/app-locale';

export const editorialPhotoSchema = z
  .object({
    media_key: z.string().min(1),
    licence: z.string().min(1),
    credit: z.string().min(1),
  })
  .strict();

export type EditorialPhoto = z.infer<typeof editorialPhotoSchema>;

/** One KNOW BEFORE YOU GO line: a short title and, when it helps, a detail under it. */
export const placeKnowSchema = z
  .object({
    title: z.string().min(1).max(60),
    detail: z.string().min(1).max(90).optional(),
  })
  .strict();

export type PlaceKnow = z.infer<typeof placeKnowSchema>;

/** The lines of a note that a translation may carry; the rest is the same in every language. */
export const editorialTextSchema = z
  .object({
    why_go: z.string().min(1),
    best_time: z.string().min(1),
    crowd_hint: z.string().min(1),
    etiquette: z.string().min(1),
    entry_short: z.string().min(1).max(12),
    dress_short: z.string().min(1).max(12),
    know_before: z.array(placeKnowSchema).max(5),
  })
  .partial()
  .strict();

export type EditorialText = z.infer<typeof editorialTextSchema>;

/** The note in other app languages than English, by app locale (`vi`, `zh-Hans`). */
export const editorialTranslationsSchema = z.partialRecord(appLocaleSchema, editorialTextSchema);

export type EditorialTranslations = z.infer<typeof editorialTranslationsSchema>;

export const editorialOverlaySchema = z
  .object({
    tips: z.array(z.string().min(1)).optional(),
    photos: z.array(editorialPhotoSchema).optional(),
    must_see: z.boolean().optional(),
    /** One of the few must-sees a first visit is built around; set only with `must_see`. */
    essential: z.boolean().optional(),
    /** Content factory editorial, written from open data only. */
    why_go: z.string().min(1).optional(),
    best_time: z.string().min(1).optional(),
    time_needed_min: z.number().int().positive().optional(),
    crowd_hint: z.string().min(1).optional(),
    etiquette: z.string().min(1).optional(),
    /**
     * Place facts, each researched with a cited source and approved by an operator before it is
     * written here (the place facts kind of the content factory). A tile without one is omitted.
     */
    entry_short: z.string().min(1).max(12).optional(),
    dress_short: z.string().min(1).max(12).optional(),
    know_before: z.array(placeKnowSchema).max(5).optional(),
    /** The note's lines in other languages; read through `localizedEditorial`. */
    i18n: editorialTranslationsSchema.optional(),
  })
  .strict();

export type EditorialOverlay = z.infer<typeof editorialOverlaySchema>;

export const EMPTY_EDITORIAL_OVERLAY: EditorialOverlay = {};

const OVERLAY_KEYS: ReadonlySet<string> = new Set(Object.keys(editorialOverlaySchema.shape));

/**
 * Reads a stored overlay (`pois.editorial`). A stored note is data we read, not input we
 * validate: a line stored as null counts as absent and a key this version does not know is
 * ignored, so neither an older publish nor a newer one takes a reader down. What remains is
 * parsed as `editorialOverlaySchema`, so a known line of the wrong type still fails.
 */
export function readEditorialOverlay(value: unknown): EditorialOverlay {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return editorialOverlaySchema.parse(value);
  const known = Object.entries(value).filter(
    ([key, line]) => OVERLAY_KEYS.has(key) && line !== null,
  );
  return editorialOverlaySchema.parse(
    Object.fromEntries(
      known.map(([key, line]) => (key === 'i18n' ? [key, readTranslations(line)] : [key, line])),
    ),
  );
}

const TEXT_KEYS: ReadonlySet<string> = new Set(Object.keys(editorialTextSchema.shape));

/** Stored translations, as leniently as the note: an unknown language or line is ignored. */
function readTranslations(value: unknown): EditorialTranslations {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([locale, text]) => {
      if (!appLocaleSchema.safeParse(locale).success) return [];
      if (typeof text !== 'object' || text === null || Array.isArray(text)) return [];
      const lines = Object.entries(text as Record<string, unknown>).filter(
        ([key, line]) => TEXT_KEYS.has(key) && line !== null,
      );
      const parsed = editorialTextSchema.safeParse(Object.fromEntries(lines));
      return parsed.success ? [[locale, parsed.data]] : [];
    }),
  );
}

/**
 * The note as a reader of `locale` sees it: each line in their language where the note has it,
 * else in English, line by line. The one place this rule lives.
 */
export function localizedEditorial(
  editorial: EditorialOverlay,
  locale: string,
): Omit<EditorialOverlay, 'i18n'> {
  const { i18n, ...english } = editorial;
  const text = appLocaleSchema.safeParse(locale).success
    ? i18n?.[locale as keyof EditorialTranslations]
    : undefined;
  return text === undefined ? english : { ...english, ...text };
}
