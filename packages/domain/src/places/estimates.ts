/**
 * AI estimates for popular places (`place_profiles.estimates`, docs/data-model.md §3.13): how long
 * a visit takes, the good times of day, when it gets busy, the entry fee, up to three tips and what
 * to wear or bring. Every field says how it is known: `cited` when a sentence on a fetched page
 * states it (the profile's quote check), `estimate` otherwise, and is shown as such. A fee or a
 * dress rule is never cited from a social page. Busy windows become hourly `crowd_forecasts`
 * curves with source `estimate`, read only when no crew-seen or approved editorial curve exists.
 */
import { z } from 'zod';

/** Times of day a place suits (`place_profiles.best_times` and the estimates' best times). */
export const PLACE_BEST_TIMES = [
  'early_morning',
  'morning',
  'midday',
  'afternoon',
  'sunset',
  'evening',
  'after_dark',
] as const;
export type PlaceBestTime = (typeof PLACE_BEST_TIMES)[number];

export const ESTIMATE_BASES = ['cited', 'estimate'] as const;
export type EstimateBasis = (typeof ESTIMATE_BASES)[number];

/** Visit length buckets Jev picks from; `minutes` is the bucket's typical visit. */
export const VISIT_BUCKETS = {
  under_30: { min: 0, max: 30, minutes: 20 },
  under_1h: { min: 30, max: 60, minutes: 45 },
  '1_2h': { min: 60, max: 120, minutes: 90 },
  '2_4h': { min: 120, max: 240, minutes: 180 },
  half_day: { min: 240, max: 360, minutes: 300 },
  full_day: { min: 360, max: 720, minutes: 480 },
} as const;
export type VisitBucket = keyof typeof VISIT_BUCKETS;
export const VISIT_BUCKET_KEYS = Object.keys(VISIT_BUCKETS) as VisitBucket[];

/** The bucket a visit of `minutes` falls in. */
export function visitBucketOf(minutes: number): VisitBucket {
  return VISIT_BUCKET_KEYS.find((key) => minutes < VISIT_BUCKETS[key].max) ?? 'full_day';
}

export const BUSY_LEVELS = ['quiet', 'moderate', 'busy'] as const;
export type BusyLevel = (typeof BUSY_LEVELS)[number];

/** Which days a busy window covers. */
export const BUSY_DAYS = ['every_day', 'weekdays', 'weekends'] as const;
export type BusyDays = (typeof BUSY_DAYS)[number];

/** At most this many busy windows per place. */
export const MAX_BUSY_WINDOWS = 5;
export const MAX_ESTIMATE_TIPS = 3;

/** `to` is exclusive: 10–14 covers the hours starting 10, 11, 12 and 13. */
export const busyWindowSchema = z
  .object({
    days: z.enum(BUSY_DAYS),
    from: z.number().int().min(0).max(23),
    to: z.number().int().min(1).max(24),
    level: z.enum(BUSY_LEVELS),
  })
  .refine((w) => w.to > w.from, { message: 'a window ends after it starts' });
export type BusyWindow = z.infer<typeof busyWindowSchema>;

/** A text field's lines by language (`en` always; `vi` for a place in Vietnam; more on demand). */
const linesSchema = z.record(z.string(), z.string());

const field = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    basis: z.enum(ESTIMATE_BASES),
    /** The page a cited field quotes; an estimate may name the page it leaned on. */
    source: z.string().optional(),
  });

export const placeEstimatesSchema = z.object({
  visit: field(
    z.object({ bucket: z.enum(VISIT_BUCKET_KEYS as [VisitBucket]), minutes: z.number().int() }),
  ).optional(),
  best_times: field(z.array(z.enum(PLACE_BEST_TIMES))).optional(),
  busy: field(z.array(busyWindowSchema).max(MAX_BUSY_WINDOWS)).optional(),
  fee: field(linesSchema).optional(),
  tips: z.array(field(linesSchema)).max(MAX_ESTIMATE_TIPS).default([]),
  dress: field(linesSchema).optional(),
});
export type PlaceEstimates = z.infer<typeof placeEstimatesSchema>;
export interface EstimateField<T> {
  readonly value: T;
  readonly basis: EstimateBasis;
  readonly source?: string | undefined;
}

/** Hosts read for suggestions and tips only, never cited for a fee or a dress rule. */
const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'reddit.com',
  'threads.net',
  'x.com',
  'twitter.com',
  'pinterest.com',
];

export function isSocialUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    return false;
  }
  return SOCIAL_HOSTS.some((social) => host === social || host.endsWith(`.${social}`));
}

/** Fields whose basis may be `cited` only from a page that is not a social post. */
export type FactLikeField = 'fee' | 'dress';

/**
 * The basis a field is stored with: `cited` only when its quote was found on the page it cites
 * (`quoteHolds`), and for a fee or a dress rule only when that page is not a social one.
 */
export function estimateBasis(
  kind: FactLikeField | 'other',
  sourceUrl: string | null,
  quoteHolds: boolean,
): EstimateBasis {
  if (sourceUrl === null || !quoteHolds) return 'estimate';
  if (kind !== 'other' && isSocialUrl(sourceUrl)) return 'estimate';
  return 'cited';
}

const LEVEL_VALUE: Readonly<Record<BusyLevel, number>> = { quiet: 20, moderate: 55, busy: 90 };
/** Hours inside a day's busy span that no window names read as quiet. */
const BETWEEN_WINDOWS = LEVEL_VALUE.quiet;

const coversDay = (days: BusyDays, dow: number) =>
  days === 'every_day' || (days === 'weekends') === (dow === 0 || dow === 6);

/**
 * One weekday's 24 hourly values (0–100, index = local hour; `dow` 0 = Sunday) from the windows,
 * or null when no window covers that day. Overlapping windows keep the busier level; hours between
 * the day's first and last window read as quiet; hours outside them as 0 (no estimate).
 */
export function busyCurve(windows: readonly BusyWindow[], dow: number): number[] | null {
  const today = windows.filter((w) => coversDay(w.days, dow));
  if (today.length === 0) return null;
  const first = Math.min(...today.map((w) => w.from));
  const last = Math.max(...today.map((w) => w.to));
  return Array.from({ length: 24 }, (_, hour) => {
    const levels = today.filter((w) => hour >= w.from && hour < w.to).map((w) => w.level);
    if (levels.length > 0) return Math.max(...levels.map((l) => LEVEL_VALUE[l]));
    return hour >= first && hour < last ? BETWEEN_WINDOWS : 0;
  });
}

/** The week's curves for the windows: one per weekday a window covers. */
export function busyWeek(
  windows: readonly BusyWindow[],
): { readonly dow: number; readonly hourly: number[] }[] {
  const week: { dow: number; hourly: number[] }[] = [];
  for (let dow = 0; dow < 7; dow += 1) {
    const hourly = busyCurve(windows, dow);
    if (hourly !== null) week.push({ dow, hourly });
  }
  return week;
}

/** The hour a curve peaks at (the first, when several tie), or null for an all-zero curve. */
export function peakHour(hourly: readonly number[]): number | null {
  let best: number | null = null;
  for (const [hour, value] of hourly.entries()) {
    if (value > 0 && (best === null || value > (hourly[best] ?? 0))) best = hour;
  }
  return best;
}

const wireField = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, label: z.enum(ESTIMATE_BASES), sourceUrl: z.string().nullable() });

/** `GET /v1/places/{id}` → `profile.estimates` (docs/api-contracts.md §5.5), in the reader's language. */
export const placeEstimatesWireSchema = z.object({
  visit: wireField({
    bucket: z.enum(VISIT_BUCKET_KEYS as [VisitBucket]),
    minutes: z.number().int(),
  }).nullable(),
  bestTimes: wireField({ value: z.array(z.enum(PLACE_BEST_TIMES)) }).nullable(),
  busy: wireField({ windows: z.array(busyWindowSchema) }).nullable(),
  fee: wireField({ text: z.string() }).nullable(),
  tips: z.array(wireField({ text: z.string() })),
  dress: wireField({ text: z.string() }).nullable(),
  /** The language the lines are in: the reader's, else English. */
  locale: z.string(),
});
export type PlaceEstimatesWire = z.infer<typeof placeEstimatesWireSchema>;

/** A text field in `locale`, else English; null when neither is written. */
function lineIn(lines: Readonly<Record<string, string>>, locale: string): string | null {
  const text = lines[locale] ?? lines['en'];
  return text === undefined || text.trim() === '' ? null : text;
}

/** The stored estimates as the reader sees them: one language, each field labelled. */
export function estimatesWire(stored: PlaceEstimates, locale: string): PlaceEstimatesWire {
  const meta = (f: { basis: EstimateBasis; source?: string | undefined }) => ({
    label: f.basis,
    sourceUrl: f.source ?? null,
  });
  const text = (f: EstimateField<Record<string, string>> | undefined) => {
    if (f === undefined) return null;
    const line = lineIn(f.value, locale);
    return line === null ? null : { text: line, ...meta(f) };
  };
  const written = [stored.fee, stored.dress, ...stored.tips].filter((f) => f !== undefined);
  const inLocale = written.length > 0 && written.every((f) => (f.value[locale] ?? '') !== '');
  return {
    visit: stored.visit === undefined ? null : { ...stored.visit.value, ...meta(stored.visit) },
    bestTimes:
      stored.best_times === undefined
        ? null
        : { value: stored.best_times.value, ...meta(stored.best_times) },
    busy: stored.busy === undefined ? null : { windows: stored.busy.value, ...meta(stored.busy) },
    fee: text(stored.fee),
    tips: stored.tips.map((tip) => text(tip)).filter((tip) => tip !== null),
    dress: text(stored.dress),
    locale: inLocale ? locale : 'en',
  };
}
