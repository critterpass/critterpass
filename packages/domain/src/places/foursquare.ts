/**
 * Foursquare Places API details, read live and passed through (docs/product-decisions.md D24).
 *
 * Foursquare's usage guidelines allow a Pay as You Go account to keep only `fsq_place_id` and photo
 * ids; every other attribute may not be cached at all. So nothing in this module is ever stored: the
 * api fetches one Place Details call per place-detail open and maps it into `PlaceLive`, which is
 * served with `Cache-Control: no-store`. `popularity` is a calculated score that the EULA keeps
 * internal, so it is never filled. Every response that carries Foursquare data carries the
 * attribution the EULA requires ("Powered by Foursquare").
 */
import { z } from 'zod';

import { WEEKDAYS, hoursSchema, type Hours, type TimeSpan, type Weekday } from './hours';

/** One Place Details call returns every field the live endpoint shows (billed once, Premium). */
export const FOURSQUARE_DETAIL_FIELDS = 'date_closed,hours,rating,price,photos,tips,website,tel';

export const FOURSQUARE_ATTRIBUTION = {
  name: 'Foursquare',
  url: 'https://foursquare.com',
} as const;

const MAX_PHOTOS = 5;
const MAX_TIPS = 3;
/** Longest edge we ask Foursquare's image service for; phones never need more. */
const PHOTO_MAX_EDGE = 1080;

export const placeLivePhotoSchema = z.object({
  url: z.url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type PlaceLivePhoto = z.infer<typeof placeLivePhotoSchema>;

export const placeLiveTipSchema = z.object({ text: z.string(), createdAt: z.string() });
export type PlaceLiveTip = z.infer<typeof placeLiveTipSchema>;

/** `GET /v1/places/{id}/live` (docs/api-contracts.md §5.5). */
export const placeLiveSchema = z.object({
  available: z.boolean(),
  openNow: z.boolean().nullable(),
  closedPermanently: z.boolean(),
  hours: hoursSchema.nullable(),
  priceLevel: z.number().int().min(1).max(4).nullable(),
  rating: z.number().min(0).max(10).nullable(),
  photos: z.array(placeLivePhotoSchema).max(MAX_PHOTOS),
  tips: z.array(placeLiveTipSchema).max(MAX_TIPS),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  popularity: z.null(),
  attribution: z.object({ name: z.string(), url: z.url() }).nullable(),
});
export type PlaceLive = z.infer<typeof placeLiveSchema>;

/** What the endpoint answers when Foursquare has nothing for us (no id, cap, timeout, error). */
export const UNAVAILABLE_PLACE_LIVE: PlaceLive = {
  available: false,
  openNow: null,
  closedPermanently: false,
  hours: null,
  priceLevel: null,
  rating: null,
  photos: [],
  tips: [],
  website: null,
  phone: null,
  popularity: null,
  attribution: null,
};

const fsqHoursPeriodSchema = z.object({
  day: z.number().int().min(1).max(7),
  open: z.string(),
  close: z.string(),
});

const fsqPhotoSchema = z.object({
  prefix: z.string(),
  suffix: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const fsqTipSchema = z.object({ text: z.string(), created_at: z.string() });

/** The subset of a Place Details response we read; anything malformed is dropped, not thrown. */
const fsqDetailsSchema = z.object({
  date_closed: z.string().nullish().catch(null),
  hours: z
    .object({
      open_now: z.boolean().optional().catch(undefined),
      regular: z.array(fsqHoursPeriodSchema).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  rating: z.number().min(0).max(10).optional().catch(undefined),
  price: z.number().int().min(1).max(4).optional().catch(undefined),
  photos: z.array(z.unknown()).optional().catch(undefined),
  tips: z.array(z.unknown()).optional().catch(undefined),
  website: z.string().min(1).optional().catch(undefined),
  tel: z.string().min(1).optional().catch(undefined),
});

const HHMM = /^\+?([01]\d|2[0-3])([0-5]\d)$/;

function clock(value: string): string | null {
  const match = HHMM.exec(value);
  return match === null ? null : `${match[1]}:${match[2]}`;
}

/**
 * Foursquare `hours.regular` (day 1 = Monday … 7 = Sunday, `open`/`close` as `HHMM`, a `+` on
 * `close` meaning the next day) as the domain weekly schedule. A next-day close at midnight is
 * `24:00`; any other next-day close stays an overnight span (end before start), which `open-at`
 * reads as running into the next day. Days Foursquare does not list stay unknown-closed, and an
 * empty or unreadable schedule is null (unknown), never "closed all week".
 */
export function foursquareHoursToHours(
  regular: ReadonlyArray<{ readonly day: number; readonly open: string; readonly close: string }>,
): Hours | null {
  const weekly: Partial<Record<Weekday, TimeSpan[]>> = {};
  for (const period of regular) {
    const day = WEEKDAYS[period.day - 1];
    const start = clock(period.open);
    const end = clock(period.close);
    if (day === undefined || start === null || end === null || period.open.startsWith('+')) {
      continue;
    }
    const nextDay = period.close.startsWith('+');
    let spanEnd = end;
    if (nextDay && end === '00:00') spanEnd = '24:00';
    else if (nextDay && end > start)
      spanEnd = '24:00'; // longer than a day: clamp to midnight
    else if (!nextDay && end <= start) continue; // a same-day close before opening is malformed
    (weekly[day] ??= []).push({ start, end: spanEnd });
  }
  for (const spans of Object.values(weekly)) spans.sort((a, b) => a.start.localeCompare(b.start));
  const parsed = hoursSchema.safeParse({ weekly });
  if (!parsed.success || Object.keys(weekly).length === 0) return null;
  return parsed.data;
}

function sizedPhoto(raw: unknown): PlaceLivePhoto | null {
  const parsed = fsqPhotoSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { prefix, suffix, width, height } = parsed.data;
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  return { url: `${prefix}${w}x${h}${suffix}`, width: w, height: h };
}

function tip(raw: unknown): PlaceLiveTip | null {
  const parsed = fsqTipSchema.safeParse(raw);
  if (!parsed.success || parsed.data.text.trim().length === 0) return null;
  return { text: parsed.data.text, createdAt: parsed.data.created_at };
}

/** Maps one Place Details body into the live endpoint's shape, attribution included. */
export function mapFoursquareDetails(body: unknown): PlaceLive {
  const parsed = fsqDetailsSchema.safeParse(body);
  if (!parsed.success) return UNAVAILABLE_PLACE_LIVE;
  const details = parsed.data;
  const closedPermanently =
    typeof details.date_closed === 'string' && details.date_closed.length > 0;
  const photos = (details.photos ?? [])
    .map(sizedPhoto)
    .filter((photo): photo is PlaceLivePhoto => photo !== null)
    .slice(0, MAX_PHOTOS);
  const tips = (details.tips ?? [])
    .map(tip)
    .filter((entry): entry is PlaceLiveTip => entry !== null)
    .slice(0, MAX_TIPS);
  return {
    available: true,
    openNow: closedPermanently ? false : (details.hours?.open_now ?? null),
    closedPermanently,
    hours: details.hours?.regular ? foursquareHoursToHours(details.hours.regular) : null,
    priceLevel: details.price ?? null,
    rating: details.rating ?? null,
    photos,
    tips,
    website: details.website ?? null,
    phone: details.tel ?? null,
    popularity: null,
    attribution: FOURSQUARE_ATTRIBUTION,
  };
}
