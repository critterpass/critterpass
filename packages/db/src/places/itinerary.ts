/**
 * A destination's itinerary (`destination_itineraries`): how the itinerary pages researchers read
 * lay out a first visit, written by the curated places loader. The stored shape is snake_case JSON
 * (`ItineraryRecord`); `destinationItinerary` reads it for the planner with every named place
 * resolved to our live row: a row merged into another reads as that one, and a row that is no
 * longer active (or was never matched) leaves only the place's name.
 */
import type pg from 'pg';

/** English and Vietnamese lines. */
export interface ItineraryLines<T> {
  readonly en: T;
  readonly vi: T;
}

/** A place an itinerary names: the name in the places file, and our row once matched. */
export interface ItineraryPlaceRecord {
  readonly name: string;
  readonly poi_id?: string;
}

/** What `destination_itineraries` stores for a destination (its jsonb columns' shapes). */
export interface ItineraryRecord {
  readonly ideal_days_min: number;
  readonly ideal_days_max: number;
  readonly areas: readonly {
    readonly name: string;
    readonly character: ItineraryLines<string>;
    readonly places: readonly ItineraryPlaceRecord[];
  }[];
  readonly days: readonly {
    readonly day: number;
    readonly theme: ItineraryLines<string>;
    readonly areas: readonly string[];
    readonly stops: readonly ItineraryPlaceRecord[];
    readonly source_count: number;
  }[];
  readonly day_trips: readonly {
    readonly name: string;
    readonly travel_minutes: number;
    readonly why: ItineraryLines<string>;
  }[];
  readonly tips: ItineraryLines<readonly string[]>;
  readonly best_months: string | null;
  readonly sources: readonly {
    readonly url: string;
    readonly title: string;
    readonly kind: string;
    readonly lang?: string;
    readonly days?: number;
  }[];
}

/** A named place of an itinerary: `poiId` is our live row, or null when none is matched. */
export interface ItineraryPlace {
  readonly name: string;
  readonly poiId: string | null;
}

export interface DestinationItinerary {
  readonly destinationId: string;
  readonly idealDays: { readonly min: number; readonly max: number };
  readonly areas: readonly {
    readonly name: string;
    readonly character: ItineraryLines<string>;
    readonly places: readonly ItineraryPlace[];
  }[];
  /** The consensus days of a first visit of `idealDays.max` days, stops in visiting order. */
  readonly days: readonly {
    readonly day: number;
    readonly theme: ItineraryLines<string>;
    readonly areas: readonly string[];
    readonly stops: readonly ItineraryPlace[];
    /** How many of the pages lay the day out this way. */
    readonly sourceCount: number;
  }[];
  readonly dayTrips: readonly {
    readonly name: string;
    readonly travelMinutes: number;
    readonly why: ItineraryLines<string>;
  }[];
  readonly tips: ItineraryLines<readonly string[]>;
  readonly bestMonths: string | null;
  readonly sources: ItineraryRecord['sources'];
  readonly loadedAt: Date;
}

interface ItineraryRow extends ItineraryRecord {
  readonly destination_id: string;
  readonly loaded_at: Date;
}

/**
 * The destination's itinerary with every place resolved to our live row, or null when none is
 * loaded. Runs in the caller's transaction, so the table's own policies apply.
 */
export async function destinationItinerary(
  tx: Pick<pg.PoolClient, 'query'>,
  destinationId: string,
): Promise<DestinationItinerary | null> {
  const { rows } = await tx.query<ItineraryRow>(
    `SELECT destination_id, ideal_days_min, ideal_days_max, areas, days, day_trips, tips,
            best_months, sources, loaded_at
       FROM destination_itineraries WHERE destination_id = $1`,
    [destinationId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const named = [...row.areas.flatMap((a) => a.places), ...row.days.flatMap((d) => d.stops)];
  const ids = [...new Set(named.flatMap((place) => place.poi_id ?? []))];
  const live = new Map<string, string>();
  if (ids.length > 0) {
    const found = await tx.query<{ id: string; live_id: string }>(
      `SELECT p.id, target.id AS live_id
         FROM pois p JOIN pois target ON target.id = coalesce(p.merged_into_id, p.id)
        WHERE p.id = ANY($1::uuid[]) AND target.status = 'active'`,
      [ids],
    );
    for (const { id, live_id } of found.rows) live.set(id, live_id);
  }
  const place = (record: ItineraryPlaceRecord): ItineraryPlace => ({
    name: record.name,
    poiId: record.poi_id === undefined ? null : (live.get(record.poi_id) ?? null),
  });
  return {
    destinationId: row.destination_id,
    idealDays: { min: row.ideal_days_min, max: row.ideal_days_max },
    areas: row.areas.map((area) => ({ ...area, places: area.places.map(place) })),
    days: row.days.map((day) => ({
      day: day.day,
      theme: day.theme,
      areas: day.areas,
      stops: day.stops.map(place),
      sourceCount: day.source_count,
    })),
    dayTrips: row.day_trips.map((trip) => ({
      name: trip.name,
      travelMinutes: trip.travel_minutes,
      why: trip.why,
    })),
    tips: row.tips,
    bestMonths: row.best_months,
    sources: row.sources,
    loadedAt: row.loaded_at,
  };
}
