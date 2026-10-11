/**
 * Offline storage (9.05) over the trip-day packs the trip feature saves: each saved trip with what
 * it holds and its size on the phone, the total and the phone's free space, whether trip days save
 * by themselves, and Save now / Remove. Reads and writes the same rows as the current page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { savedMapAreas } from '@/data/areas/saved-map-areas';
import { useAreaLinks } from '@/data/areas/use-area-links';
import { useTripAreasOn } from '@/data/areas/use-trip-areas';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useQuietLiveRows as useLiveRows } from '@/data/powersync/live-rows';
import {
  AUTO_ID,
  AUTO_SQL,
  autoDownloadOn,
  PREFS_KIND,
  BUNDLE_KIND,
  parseSavedDay,
  refreshTripDays,
  removeTripDays,
  type RefreshOutcome,
  type SavedDay,
  type SavedTrip,
  useTripDayServices,
} from '@/features/trip';

const SAVED_SQL = `SELECT l.data, t.id AS trip_id, d.name AS destination_name
  FROM local_private l
  JOIN trips t ON l.id LIKE '${BUNDLE_KIND}:' || t.id || ':%'
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE l.kind = ?`;

const AREA_DAYS_SQL = `SELECT d.trip_id, d.date, d.destination_id, t.destination_id AS trip_destination_id
  FROM plan_days d JOIN trips t ON t.id = d.trip_id AND t.current_version_id = d.version_id
  WHERE d.destination_id IS NOT NULL AND d.date IS NOT NULL`;

interface SavedRow {
  readonly data: string;
  readonly trip_id: string;
  readonly destination_name: string | null;
}

interface AreaDayRow {
  readonly trip_id: string;
  readonly date: string;
  readonly destination_id: string;
  readonly trip_destination_id: string | null;
}

export interface OfflineStorage {
  readonly trips: readonly SavedTrip[];
  readonly totalBytes: number;
  /** Free space on the phone, or null when the OS won't say. */
  readonly freeBytes: number | null;
  readonly auto: boolean;
  readonly setAuto: (next: boolean) => void;
  readonly save: (tripId: string) => Promise<RefreshOutcome['kind'] | 'failed'>;
  readonly remove: (tripId: string) => void;
}

export function useOfflineStorage(): OfflineStorage {
  const { db } = useLocalFirst();
  const services = useTripDayServices();
  const saved = useLiveRows<SavedRow>(
    SAVED_SQL,
    [BUNDLE_KIND],
    ['local_private', 'trips', 'destinations'],
  ).rows;
  const auto = autoDownloadOn(
    useLiveRows<{ data: string }>(AUTO_SQL, [AUTO_ID], ['local_private']).rows,
  );
  const areasOn = useTripAreasOn();
  const areaDays = useLiveRows<AreaDayRow>(AREA_DAYS_SQL, areasOn ? [] : null, [
    'plan_days',
    'trips',
  ]).rows;
  const links = useAreaLinks(
    areaDays.flatMap((day) => (day.trip_destination_id === null ? [] : [day.trip_destination_id])),
  ).links;

  const trips = useMemo(() => {
    const byTrip = new Map<string, SavedTrip>();
    const daysOf = new Map<string, SavedDay[]>();
    for (const row of saved) {
      const day = parseSavedDay(row.data);
      if (day === null) continue;
      const current = byTrip.get(row.trip_id);
      const kinds = new Set([...(current?.kinds ?? []), ...day.assets.map((asset) => asset.kind)]);
      const days = [...(daysOf.get(row.trip_id) ?? []), day];
      daysOf.set(row.trip_id, days);
      const areaOfDate = new Map(
        areaDays.flatMap((one) => {
          const name = links.find((link) => link.toId === one.destination_id)?.toName;
          return one.trip_id === row.trip_id && name !== undefined
            ? [[one.date, name] as const]
            : [];
        }),
      );
      byTrip.set(row.trip_id, {
        tripId: row.trip_id,
        name: row.destination_name ?? '',
        kinds: [...kinds],
        bytes: services.folderBytes(row.trip_id),
        mapAreas: areasOn ? savedMapAreas(days, row.destination_name ?? '', areaOfDate) : [],
      });
    }
    return [...byTrip.values()];
  }, [saved, areaDays, links, areasOn, services]);

  return {
    trips,
    totalBytes: trips.reduce((sum, trip) => sum + trip.bytes, 0),
    freeBytes: services.freeBytes(),
    auto,
    setAuto: (next) =>
      void db.execute(
        'INSERT OR REPLACE INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
        [AUTO_ID, PREFS_KIND, JSON.stringify({ auto: next }), new Date().toISOString()],
      ),
    save: (tripId) =>
      refreshTripDays(db, services, tripId)
        .then((outcome) => outcome.kind)
        .catch(() => 'failed' as const),
    remove: (tripId) => void removeTripDays(db, services, tripId),
  };
}
