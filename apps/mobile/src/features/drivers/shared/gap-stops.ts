/** A plan day's placed stops as the pickup-gap check reads them (`HH:MM` local times). */
import type { GapStop } from '@cp/domain';

const hhmm = (minutes: number | null): string | null => {
  if (minutes === null) return null;
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function gapStopsOf(
  stops: readonly {
    readonly title: string;
    readonly start: number | null;
    readonly end: number | null;
    readonly place: { readonly lat: number; readonly lng: number } | null;
  }[],
): GapStop[] {
  return stops.flatMap((stop) =>
    stop.place === null
      ? []
      : [
          {
            name: stop.title,
            lat: stop.place.lat,
            lng: stop.place.lng,
            starts: hhmm(stop.start),
            ends: hhmm(stop.end),
          },
        ],
  );
}
