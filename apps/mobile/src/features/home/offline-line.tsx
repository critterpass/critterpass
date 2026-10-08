/**
 * Home's offline line under the trip's card: "Ready offline" once the trip's place cards and its
 * saved days are on the phone, else what is still on its way. Read from the phone alone (synced
 * plan and place rows, the saved day bundles), so it says the same in airplane mode.
 *
 * While the server refuses the upload queue the line says that instead, with or without a trip:
 * changes made on this phone are not reaching the crew, which matters more than what is saved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { toLocalWallTime, type HomeTripInput } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { SAVED_DAYS_SQL, savedDaysParams, type SavedDay } from '@/data/trip-day/saved-days';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useLiveRows } from './data/watch-query';
import { offlineLineFor, type OfflineLine } from './offline-readiness';

const MISSING_PLACES_SQL = `SELECT count(DISTINCT i.poi_id) AS n
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id AND i.version_id = t.current_version_id
  LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.trip_id = ? AND i.poi_id IS NOT NULL AND p.id IS NULL`;
const MISSING_PLACES_TABLES = ['plan_items', 'trips', 'pois'];
const SAVED_DAYS_TABLES = ['local_private'];

const useStyles = makeStyles(() => ({ text: { flexShrink: 1 } }));

function parseDay(data: string): SavedDay | null {
  try {
    return JSON.parse(data) as SavedDay;
  } catch {
    return null;
  }
}

function useLineCopy(): (line: OfflineLine) => string {
  const { t } = useLingui();
  return (line) => {
    if (line.kind === 'ready') return t({ id: 'home.offline.ready', message: 'Ready offline' });
    if (line.kind === 'no_space') {
      if (line.what === 'tickets')
        return t({
          id: 'home.offline.noSpaceTickets',
          message: 'No room on the phone for tickets',
        });
      if (line.what === 'phrases')
        return t({
          id: 'home.offline.noSpacePhrases',
          message: 'No room on the phone for phrase cards',
        });
      return t({ id: 'home.offline.noSpaceMap', message: 'No room on the phone for the map' });
    }
    switch (line.what) {
      case 'places':
        return t({ id: 'home.offline.places', message: "Still downloading the trip's places" });
      case 'today':
        return t({ id: 'home.offline.today', message: "Still downloading today's files" });
      case 'tickets':
        return t({ id: 'home.offline.tickets', message: 'Still downloading tickets' });
      case 'phrases':
        return t({ id: 'home.offline.phrases', message: 'Still downloading phrase cards' });
      case 'map':
        return t({ id: 'home.offline.map', message: 'Still downloading the map' });
    }
  };
}

export function OfflineLineRow({
  trip,
  now,
}: {
  /** The trip whose card the line sits under; null when Home shows none. */
  readonly trip: HomeTripInput | null;
  readonly now: Date;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const copy = useLineCopy();
  const sync = useSyncStatus();
  const places = useLiveRows<{ n: number }>(
    MISSING_PLACES_SQL,
    trip === null ? null : [trip.id],
    MISSING_PLACES_TABLES,
  );
  const saved = useLiveRows<{ data: string }>(
    SAVED_DAYS_SQL,
    trip === null ? null : savedDaysParams(trip.id),
    SAVED_DAYS_TABLES,
  );
  if (sync.uploadHeld) {
    return (
      <Row gap="8" testID="home-sync-held">
        <Text variant="caption" color={theme.semantic.text.secondary} style={styles.text}>
          {t({
            id: 'home.offline.held',
            message: "Some changes can't be sent yet. We'll keep trying when the app is opened.",
          })}
        </Text>
      </Row>
    );
  }
  if (trip === null || !places.loaded || !saved.loaded) return null;
  const tz = trip.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const line = offlineLineFor({
    today: toLocalWallTime(now, tz).date,
    startDate: trip.startDate,
    endDate: trip.endDate,
    missingPlaces: places.rows[0]?.n ?? 0,
    synced: sync.lastSyncedAt !== null,
    days: saved.rows.flatMap((row) => parseDay(row.data) ?? []),
  });
  if (line === null) return null;
  const ready = line.kind === 'ready';
  return (
    <Row gap="8" testID={ready ? 'home-offline-ready' : 'home-offline-pending'}>
      {ready ? <Icon name="check" size={16} decorative /> : null}
      <Text variant="caption" color={theme.semantic.text.secondary} style={styles.text}>
        {copy(line)}
      </Text>
    </Row>
  );
}
