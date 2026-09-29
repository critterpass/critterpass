/**
 * Travel-data vocabulary (docs/data-model.md §3.4 `price_quotes`, §3.12 `weather_snapshots` and
 * `crowd_forecasts`, plus the fare, season and hazard tables this layer adds). Every CHECK list in
 * the travel-data migrations is copied from the enums here, and every `jsonb` column is validated
 * against the schemas here before it is written.
 */
import { z } from 'zod';

export const PRICE_QUOTE_KINDS = ['flight', 'stay', 'activity', 'transfer'] as const;
export const priceQuoteKindSchema = z.enum(PRICE_QUOTE_KINDS);
export type PriceQuoteKind = z.infer<typeof priceQuoteKindSchema>;

export const PRICE_QUOTE_SOURCES = ['travelpayouts', 'viator', 'user', 'estimate'] as const;
export const priceQuoteSourceSchema = z.enum(PRICE_QUOTE_SOURCES);
export type PriceQuoteSource = z.infer<typeof priceQuoteSourceSchema>;

export const WEATHER_SOURCES = ['weatherapi'] as const;
export const weatherSourceSchema = z.enum(WEATHER_SOURCES);
export type WeatherSource = z.infer<typeof weatherSourceSchema>;

export const CROWD_SOURCES = ['besttime'] as const;
export const crowdSourceSchema = z.enum(CROWD_SOURCES);

export const SEASON_COLOUR_ROLES = ['cheapest', 'peak', 'normal'] as const;
export const seasonColourRoleSchema = z.enum(SEASON_COLOUR_ROLES);
export type SeasonColourRole = z.infer<typeof seasonColourRoleSchema>;

/** Where a month's `price_index` came from: authored, or recomputed from nightly fares. */
export const SEASON_PRICE_INDEX_SOURCES = ['editorial', 'fares'] as const;
export const seasonPriceIndexSourceSchema = z.enum(SEASON_PRICE_INDEX_SOURCES);

export const SEASON_EVENT_KINDS = [
  'blossom',
  'foliage',
  'festival',
  'ceremony',
  'holiday',
  'closure',
] as const;
export const seasonEventKindSchema = z.enum(SEASON_EVENT_KINDS);
export type SeasonEventKind = z.infer<typeof seasonEventKindSchema>;

/** `typical` = recurring window from normals; `forecast` = this year's published forecast. */
export const SEASON_EVENT_CONFIDENCES = ['typical', 'forecast', 'confirmed'] as const;
export const seasonEventConfidenceSchema = z.enum(SEASON_EVENT_CONFIDENCES);

export const HAZARD_KINDS = ['volcano', 'weather_warning'] as const;
export const hazardKindSchema = z.enum(HAZARD_KINDS);
export type HazardKind = z.infer<typeof hazardKindSchema>;

export const HAZARD_SOURCES = ['magma', 'imo', 'jma', 'cenapred', 'gdacs'] as const;
export const hazardSourceSchema = z.enum(HAZARD_SOURCES);
export type HazardSource = z.infer<typeof hazardSourceSchema>;

/**
 * Hazard levels normalised across feeds: 1 normal/green, 2 advisory/yellow, 3 watch/orange,
 * 4 warning/red. `level_label` keeps the feed's own wording ("Level II (Waspada)", "Orange").
 */
export const HAZARD_LEVEL_MIN = 1;
export const HAZARD_LEVEL_MAX = 4;
export const hazardLevelSchema = z.number().int().min(HAZARD_LEVEL_MIN).max(HAZARD_LEVEL_MAX);
export type HazardLevel = z.infer<typeof hazardLevelSchema>;

const isoDate = z.iso.date();
const isoInstant = z.iso.datetime({ offset: true });
const iata = z.string().regex(/^[A-Z]{3}$/, 'must be an IATA code');

export const iataCodeSchema = iata;

/** One departure day of a fare cell: the cheapest round trip seen leaving that day. */
export const fareDaySchema = z
  .object({
    depart_on: isoDate,
    return_on: isoDate.nullable(),
    price_minor: z.number().int().nonnegative(),
    transfers: z.number().int().nonnegative(),
  })
  .strict();
export type FareDay = z.infer<typeof fareDaySchema>;

/** One nightly observation of a fare cell's cheapest price, kept for the 7-day drop check. */
export const farePriceObservationSchema = z
  .object({ on: isoDate, price_minor: z.number().int().nonnegative() })
  .strict();
export type FarePriceObservation = z.infer<typeof farePriceObservationSchema>;

/** One forecast hour as stored in `weather_snapshots.hourly` (WeatherAPI.com field names mapped). */
export const weatherHourSchema = z
  .object({
    at: isoInstant,
    temp_c: z.number(),
    chance_of_rain: z.number().int().min(0).max(100),
    precip_mm: z.number().nonnegative(),
    wind_kph: z.number().nonnegative(),
    gust_kph: z.number().nonnegative(),
    uv: z.number().nonnegative(),
    code: z.number().int(),
    is_day: z.boolean(),
  })
  .strict();
export type WeatherHour = z.infer<typeof weatherHourSchema>;

export const weatherDaySchema = z
  .object({
    max_temp_c: z.number(),
    min_temp_c: z.number(),
    chance_of_rain: z.number().int().min(0).max(100),
    precip_mm: z.number().nonnegative(),
    uv: z.number().nonnegative(),
    code: z.number().int(),
  })
  .strict();
export type WeatherDay = z.infer<typeof weatherDaySchema>;

/** An official weather alert the forecast carried (WeatherAPI.com `alerts`). */
export const weatherAlertSchema = z
  .object({
    kind: z.string().min(1),
    severity: z.string().min(1),
    headline: z.string().nullable(),
    from: isoInstant.nullable(),
    to: isoInstant.nullable(),
  })
  .strict();
export type WeatherAlert = z.infer<typeof weatherAlertSchema>;

/** `weather_snapshots.hourly`: one local date at one point, with the alerts current when fetched. */
export const weatherSnapshotBodySchema = z
  .object({
    day: weatherDaySchema,
    hours: z.array(weatherHourSchema),
    alerts: z.array(weatherAlertSchema).optional(),
  })
  .strict();
export type WeatherSnapshotBody = z.infer<typeof weatherSnapshotBodySchema>;

/** Sea temperature and tides need WeatherAPI.com Pro+; lower plans leave them null. */
export const marineHourSchema = z
  .object({
    at: isoInstant,
    wave_m: z.number().nonnegative(),
    swell_m: z.number().nonnegative(),
    swell_period_s: z.number().nonnegative(),
    water_temp_c: z.number().nullable(),
  })
  .strict();
export type MarineHour = z.infer<typeof marineHourSchema>;

export const tideSchema = z
  .object({ at: isoInstant, height_m: z.number(), type: z.enum(['high', 'low']) })
  .strict();
export type Tide = z.infer<typeof tideSchema>;

/** `weather_snapshots.marine`. */
export const marineSnapshotBodySchema = z
  .object({ hours: z.array(marineHourSchema), tides: z.array(tideSchema).nullable() })
  .strict();
export type MarineSnapshotBody = z.infer<typeof marineSnapshotBodySchema>;

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
export type MonthKey = z.infer<typeof monthKeySchema>;
