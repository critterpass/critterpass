/** The rain window for one trip day, live from the synced forecast. */
import { WEATHER_SQL, WEATHER_TABLES } from '../day/queries';
import { rainWindow, type RainForecast } from './weather';
import { useLiveRows } from '@/data/plan/live-rows';

export function useRainWindow(
  destinationId: string | null,
  date: string | null,
  tz: string,
): RainForecast {
  const rows = useLiveRows<{ hourly: string | null }>(
    WEATHER_SQL,
    destinationId === null || date === null ? null : [destinationId, date],
    WEATHER_TABLES,
  );
  if (date === null) return { kind: 'unavailable' };
  return rainWindow(rows.rows[0]?.hourly ?? null, tz, date);
}
