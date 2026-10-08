/**
 * The forecast screen (3k-7) over synced rows: the trip's destination forecast
 * (`weather_snapshots`, the destination's centre point), the plan's day themes and the watch list
 * (`watch_items`, with the open storm decision of a PLAN B row). Titles, details and themes are
 * read in the app's language (guide text).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useSyncPhase } from '@/data/status/use-sync-status';
import { useGuideText } from '@/lib/i18n/guide-text';
import { goBackOr } from '@/lib/navigation/back';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { useLiveRows } from '../../hub/data/live-rows';
import { guideOr } from '../../hub/guide';
import { tripDayRoute, TRIPS_TAB } from '../../hub/routes';
import { ForecastView } from './forecast-view';
import { forecastModel, type DayRow, type SnapshotRow, type WatchRowData } from './model';

const TRIP_SQL = `SELECT t.destination_id, coalesce(t.tz, d.tz, 'UTC') AS tz, d.name AS place,
    g.slug AS guide_slug, t.current_version_id
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = ?`;
const SNAPSHOTS_SQL = `SELECT date, hourly FROM weather_snapshots
  WHERE destination_id = ? AND point_key = 'centroid' ORDER BY date, fetched_at DESC`;
const DAYS_SQL = `SELECT date, theme, i18n FROM plan_days WHERE version_id = ? ORDER BY day_no`;
const WATCH_SQL = `SELECT w.id, w.kind, w.day, w.status, w.score, w.title, w.detail, w.i18n,
    w.checked_at, w.disruption_id, d.decision_poll_id AS poll_id
  FROM watch_items w
  LEFT JOIN disruptions d ON d.id = w.disruption_id AND d.status = 'open'
  WHERE w.trip_id = ? AND w.resolved_at IS NULL`;

interface TripRow {
  readonly destination_id: string | null;
  readonly tz: string;
  readonly place: string | null;
  readonly guide_slug: string | null;
  readonly current_version_id: string | null;
}

export function ForecastScreen({ tripId }: { readonly tripId: string }) {
  const syncPhase = useSyncPhase();
  const words = useGuideText();
  const tripRows = useLiveRows<TripRow>(TRIP_SQL, [tripId], ['trips', 'destinations', 'guides']);
  const trip = tripRows.rows[0];
  const snapshots = useLiveRows<SnapshotRow>(
    SNAPSHOTS_SQL,
    trip?.destination_id == null ? null : [trip.destination_id],
    ['weather_snapshots'],
  );
  const days = useLiveRows<DayRow>(
    DAYS_SQL,
    trip?.current_version_id == null ? null : [trip.current_version_id],
    ['plan_days'],
  ).rows;
  const watch = useLiveRows<WatchRowData>(WATCH_SQL, [tripId], ['watch_items', 'disruptions']);
  const tz = trip?.tz ?? 'UTC';
  const model = useMemo(() => {
    const now = new Date();
    return forecastModel(snapshots.rows, watch.rows, toLocalWallTime(now, tz).date, now);
  }, [snapshots.rows, watch.rows, tz]);
  const back = t({ id: 'trip.disruptions.flight.backTo', message: 'Trip' });
  // A trip that is not on this phone has no forecast: "all clear" would be a guess.
  if (tripRows.loaded && trip === undefined) {
    return <ScreenMissing backLabel={back} fallback={TRIPS_TAB} testID="forecast-missing" />;
  }
  return (
    <ForecastView
      state={tripRows.loaded && watch.loaded ? 'ready' : 'loading'}
      model={model}
      place={trip?.place ?? back}
      tz={tz}
      guide={guideOr(trip?.guide_slug)}
      offline={syncPhase === 'offline'}
      themeFor={(date) => {
        const day = days.find((d) => d.date === date);
        return day === undefined ? null : words('plan_day', day, 'theme');
      }}
      wordsFor={(entry) => ({
        title: words('watch_item', entry.row, 'title') ?? entry.row.title,
        detail: words('watch_item', entry.row, 'detail') ?? entry.row.detail,
      })}
      onBack={() => goBackOr(tripDayRoute(tripId, null))}
      onOpenStorm={(pollId) =>
        router.push({ pathname: '/(trip)/storm/[pollId]', params: { pollId } })
      }
    />
  );
}
