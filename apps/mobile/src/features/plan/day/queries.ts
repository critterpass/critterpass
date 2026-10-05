/**
 * Local queries for a day's weather and the destination's places. The plan itself (trip, days,
 * items, queued edits, open change sets) is read through `@/data/plan`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */

export const WEATHER_SQL = `SELECT hourly, fetched_at FROM weather_snapshots
  WHERE destination_id = ? AND date = ? ORDER BY fetched_at DESC LIMIT 1`;
export const WEATHER_TABLES = ['weather_snapshots'];

/**
 * The destination's places on the phone: matched in code, so a place typed without its accents
 * ("My Son") still finds "Mỹ Sơn Sanctuary".
 */
export const DESTINATION_PLACES_SQL = `SELECT id, name, name_local, category, lat, lng FROM pois
  WHERE destination_id = ? AND status = 'active'`;
export const PLACES_TABLES = ['pois', 'saved_items'];
