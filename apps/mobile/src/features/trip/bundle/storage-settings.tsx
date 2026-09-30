/**
 * Settings > Offline (3n-2, OFFLINE group): each trip saved on the phone ("Bali trip saved offline
 * · Bookings, maps, phrases · 84 MB") with Save today now and Remove, and whether trip days
 * download by themselves. Offline maps are free, so nothing here is gated.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and Intl option values, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { useLiveRows } from '../hub/data/live-rows';
import { AUTO_ID, AUTO_SQL, autoDownloadOn, PREFS_KIND } from './background-prefetch';
import { BUNDLE_KIND, refreshTripDays, removeTripDays, type SavedDay } from './bundle-manager';
import { useTripDayServices } from './services';

const SAVED_SQL = `SELECT l.data, t.id AS trip_id, d.name AS destination_name
  FROM local_private l
  JOIN trips t ON l.id LIKE '${BUNDLE_KIND}:' || t.id || ':%'
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE l.kind = ?`;

export interface SavedTrip {
  readonly tripId: string;
  readonly name: string;
  readonly kinds: readonly string[];
  readonly bytes: number;
}

export interface StorageSettingsViewProps {
  readonly trips: readonly SavedTrip[];
  readonly auto: boolean;
  readonly onAuto: (next: boolean) => void;
  readonly onSave: (tripId: string) => void;
  readonly onRemove: (tripId: string) => void;
}

export function StorageSettingsView({
  trips,
  auto,
  onAuto,
  onSave,
  onRemove,
}: StorageSettingsViewProps) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const kindName = (kind: string) =>
    kind === 'attachment'
      ? t({ id: 'trip.offline.kind.bookings', message: 'Bookings' })
      : kind === 'map_region'
        ? t({ id: 'trip.offline.kind.maps', message: 'maps' })
        : t({ id: 'trip.offline.kind.phrases', message: 'phrases' });
  const rows: SettingsRow[] = trips.flatMap((trip) => {
    const size = format.number(locale, trip.bytes / (1024 * 1024), { maximumFractionDigits: 0 });
    const name = trip.name;
    const what = trip.kinds.map(kindName).join(', ');
    return [
      {
        key: `${trip.tripId}-saved`,
        kind: 'value' as const,
        title: t({ id: 'trip.offline.savedTrip', message: `${name} trip saved offline` }),
        subtitle: [what, t({ id: 'trip.offline.size', message: `${size} MB` })]
          .filter(Boolean)
          .join(' · '),
        value: t({ id: 'trip.offline.saveNow', message: 'Save today' }),
        onPress: () => onSave(trip.tripId),
      },
      {
        key: `${trip.tripId}-remove`,
        kind: 'value' as const,
        title: t({ id: 'trip.offline.removeTitle', message: 'Take it off this phone' }),
        value: t({ id: 'trip.offline.remove', message: 'Remove' }),
        onPress: () => onRemove(trip.tripId),
      },
    ];
  });
  return (
    <Scaffold variant="dark" edges={['top']} testID="trip-offline-storage">
      <ScrollView contentContainerStyle={{ padding: theme.size.gutter }}>
        <Stack gap="20">
          <BackEyebrow label={t({ id: 'trip.offline.backToSettings', message: 'Settings' })} />
          <Text variant="h1" accessibilityRole="header">
            {t({ id: 'trip.offline.storageTitle', message: 'Offline' })}
          </Text>
          <SettingsGroup
            rows={[
              {
                key: 'auto',
                kind: 'toggle',
                title: t({ id: 'trip.offline.auto', message: 'Save trip days by themselves' }),
                subtitle: t({
                  id: 'trip.offline.autoLine',
                  message:
                    'Whenever the app is open in the days around a trip, and as an early start begins',
                }),
                value: auto,
                onChange: onAuto,
              },
            ]}
            testID="trip-offline-auto"
          />
          {rows.length === 0 ? (
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({
                id: 'trip.offline.nothingSaved',
                message: 'No trip is saved on this phone yet.',
              })}
            </Text>
          ) : (
            <SettingsGroup
              title={t({ id: 'trip.offline.savedTitle', message: 'Saved trips' })}
              rows={rows}
            />
          )}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

export function StorageSettingsScreen() {
  const { db } = useLocalFirst();
  const { t } = useLingui();
  const services = useTripDayServices();
  const saved = useLiveRows<{ data: string; trip_id: string; destination_name: string | null }>(
    SAVED_SQL,
    [BUNDLE_KIND],
    ['local_private', 'trips', 'destinations'],
  ).rows;
  const auto = autoDownloadOn(
    useLiveRows<{ data: string }>(AUTO_SQL, [AUTO_ID], ['local_private']).rows,
  );
  const byTrip = new Map<string, SavedTrip>();
  for (const row of saved) {
    const day = JSON.parse(row.data) as SavedDay;
    const current = byTrip.get(row.trip_id);
    const kinds = new Set([...(current?.kinds ?? []), ...day.assets.map((asset) => asset.kind)]);
    byTrip.set(row.trip_id, {
      tripId: row.trip_id,
      name: row.destination_name ?? '',
      kinds: [...kinds],
      bytes: services.folderBytes(row.trip_id),
    });
  }
  return (
    <StorageSettingsView
      trips={[...byTrip.values()]}
      auto={auto}
      onAuto={(next) =>
        void db.execute(
          'INSERT OR REPLACE INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
          [AUTO_ID, PREFS_KIND, JSON.stringify({ auto: next }), new Date().toISOString()],
        )
      }
      onSave={(tripId) => {
        void refreshTripDays(db, services, tripId)
          .then((outcome) =>
            toast.show({
              id: 'trip-offline-save',
              title:
                outcome.kind === 'saved'
                  ? t({
                      id: 'trip.offline.savedToast',
                      message: 'Saved. Today works with no signal.',
                    })
                  : t({
                      id: 'trip.offline.saveFailed',
                      message: 'Needs signal to save. Try again when you have it.',
                    }),
            }),
          )
          .catch(() => undefined);
      }}
      onRemove={(tripId) => void removeTripDays(db, services, tripId)}
    />
  );
}
