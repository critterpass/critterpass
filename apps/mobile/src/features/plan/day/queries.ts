/**
 * Local queries for the day screen's add sheet and weather. The plan itself (trip, days, items,
 * queued edits, open change sets) is read through `@/data/plan`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const WEATHER_SQL = `SELECT hourly, fetched_at FROM weather_snapshots
  WHERE destination_id = ? AND date = ? ORDER BY fetched_at DESC LIMIT 1`;
export const WEATHER_TABLES = ['weather_snapshots'];

/** Places for "add to the day": curated places of the destination matching the query. */
/**
 * The destination's places on the phone, for the add sheet to search: matched in code, so a place
 * typed without its accents ("My Son") still finds "Mỹ Sơn Sanctuary".
 */
export const DESTINATION_PLACES_SQL = `SELECT id, name, name_local, category, lat, lng FROM pois
  WHERE destination_id = ? AND status = 'active'`;
export const SAVED_PLACES_SQL = `SELECT p.id, p.name, p.category, p.lat, p.lng
  FROM saved_items s JOIN pois p ON p.id = s.ref_id
  WHERE s.kind = 'place' AND p.destination_id = ? ORDER BY s.created_at DESC LIMIT 30`;
export const PLACES_TABLES = ['pois', 'saved_items'];

export interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}
