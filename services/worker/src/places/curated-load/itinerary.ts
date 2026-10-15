/**
 * A destination's itinerary file (`itineraries/<slug>.json`), written by the researchers next to
 * its places file: its areas, the consensus days of a first visit, day trips, city tips and the
 * pages read. It is loaded after the destination's places, so every place it names carries the row
 * that place was matched to (`destination_itineraries`); a place no row carries keeps its name.
 * A file that fails its check is reported and never half-loaded.
 */
import { withSystem, type ItineraryPlaceRecord, type ItineraryRecord } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { curatedNameKey } from './rows';

const line = (max: number) => z.string().trim().min(1).max(max);
const url = z.string().regex(/^https?:\/\//u);

export const curatedItinerarySchema = z
  .object({
    destination: z.string().min(1),
    ideal_days: z
      .object({ min: z.number().int().min(1).max(10), max: z.number().int().min(1).max(10) })
      .refine((days) => days.min <= days.max, { message: 'min is at most max' }),
    areas: z
      .array(
        z.object({
          name: line(80),
          character_en: line(160),
          character_vi: line(160),
          places: z.array(line(200)).default([]),
        }),
      )
      .min(1)
      .max(12),
    consensus_days: z
      .array(
        z.object({
          day: z.number().int().min(1),
          theme_en: line(80),
          theme_vi: line(80),
          areas: z.array(line(80)).default([]),
          stops: z.array(line(200)).min(2).max(8),
          source_count: z.number().int().min(1),
        }),
      )
      .min(1)
      .max(10),
    day_trips: z
      .array(
        z.object({
          name: line(120),
          travel_minutes: z.number().int().min(0),
          why_en: line(160),
          why_vi: line(160),
        }),
      )
      .max(5)
      .default([]),
    city_tips_en: z.array(line(160)).max(5).default([]),
    city_tips_vi: z.array(line(160)).max(5).default([]),
    best_months: line(120).nullable().optional(),
    sources: z
      .array(
        z.object({
          url,
          title: line(200),
          kind: line(40),
          lang: z.string().trim().min(2).max(10).optional(),
          days: z.number().int().min(1).optional(),
        }),
      )
      .min(1),
  })
  .refine((file) => file.city_tips_en.length === file.city_tips_vi.length, {
    message: 'city_tips_en and city_tips_vi hold the same tips',
    path: ['city_tips_vi'],
  });

export type CuratedItinerary = z.infer<typeof curatedItinerarySchema>;

/**
 * The itinerary as stored: each place named by its places-file name, with the row it was matched
 * to (`placed`, by `curatedNameKey`) where there is one.
 */
export function itineraryRecord(
  file: CuratedItinerary,
  placed: ReadonlyMap<string, string>,
): ItineraryRecord {
  const place = (name: string): ItineraryPlaceRecord => {
    const poiId = placed.get(curatedNameKey(name));
    return poiId === undefined ? { name } : { name, poi_id: poiId };
  };
  return {
    ideal_days_min: file.ideal_days.min,
    ideal_days_max: file.ideal_days.max,
    areas: file.areas.map((area) => ({
      name: area.name,
      character: { en: area.character_en, vi: area.character_vi },
      places: area.places.map(place),
    })),
    days: file.consensus_days.map((day) => ({
      day: day.day,
      theme: { en: day.theme_en, vi: day.theme_vi },
      areas: day.areas,
      stops: day.stops.map(place),
      source_count: day.source_count,
    })),
    day_trips: file.day_trips.map((trip) => ({
      name: trip.name,
      travel_minutes: trip.travel_minutes,
      why: { en: trip.why_en, vi: trip.why_vi },
    })),
    tips: { en: file.city_tips_en, vi: file.city_tips_vi },
    best_months: file.best_months ?? null,
    sources: file.sources.map((source) => ({
      url: source.url,
      title: source.title,
      kind: source.kind,
      ...(source.lang === undefined ? {} : { lang: source.lang }),
      ...(source.days === undefined ? {} : { days: source.days }),
    })),
  };
}

export interface ItineraryLoadReport {
  readonly destination: string;
  readonly status: 'loaded' | 'checked' | 'unknown_destination';
  /** Places the days and areas name, and how many of them carry a row. */
  readonly places: number;
  readonly resolved: number;
  readonly unresolved: readonly string[];
}

/** Writes (or with `dryRun` only checks) one destination's itinerary, replacing an earlier one. */
export async function loadCuratedItinerary(
  pool: pg.Pool,
  file: CuratedItinerary,
  placed: ReadonlyMap<string, string>,
  options: { readonly dryRun: boolean },
): Promise<ItineraryLoadReport> {
  const record = itineraryRecord(file, placed);
  const named = [...record.areas.flatMap((a) => a.places), ...record.days.flatMap((d) => d.stops)];
  const unresolved = [...new Set(named.filter((p) => p.poi_id === undefined).map((p) => p.name))];
  const counts = {
    places: named.length,
    resolved: named.filter((p) => p.poi_id !== undefined).length,
    unresolved,
  };
  const written = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM destinations WHERE slug = $1', [
      file.destination,
    ]);
    const destinationId = rows[0]?.id;
    if (destinationId === undefined) return 'unknown_destination' as const;
    if (options.dryRun) return 'checked' as const;
    await tx.query(
      `INSERT INTO destination_itineraries
              (destination_id, ideal_days_min, ideal_days_max, areas, days, day_trips, tips,
               best_months, sources, loaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (destination_id) DO UPDATE
          SET ideal_days_min = EXCLUDED.ideal_days_min, ideal_days_max = EXCLUDED.ideal_days_max,
              areas = EXCLUDED.areas, days = EXCLUDED.days, day_trips = EXCLUDED.day_trips,
              tips = EXCLUDED.tips, best_months = EXCLUDED.best_months,
              sources = EXCLUDED.sources, loaded_at = EXCLUDED.loaded_at`,
      [
        destinationId,
        record.ideal_days_min,
        record.ideal_days_max,
        JSON.stringify(record.areas),
        JSON.stringify(record.days),
        JSON.stringify(record.day_trips),
        JSON.stringify(record.tips),
        record.best_months,
        JSON.stringify(record.sources),
      ],
    );
    return 'loaded' as const;
  });
  return { destination: file.destination, status: written, ...counts };
}
