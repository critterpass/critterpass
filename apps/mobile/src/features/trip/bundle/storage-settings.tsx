/**
 * Settings > Offline (3n-2, OFFLINE group): each trip saved on the phone ("Bali trip saved offline
 * · Bookings, maps, phrases · 84 MB") with Save today now and Remove, and whether trip days
 * download by themselves. Offline maps are free, so nothing here is gated.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and Intl option values, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { savedMapAreas } from '@/data/areas/saved-map-areas';
import { useAreaLinks } from '@/data/areas/use-area-links';
import { useTripAreasOn } from '@/data/areas/use-trip-areas';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { useLiveRows } from '../hub/data/live-rows';
import { AUTO_ID, AUTO_SQL, autoDownloadOn, PREFS_KIND } from './background-prefetch';
import {
  BUNDLE_KIND,
  parseSavedDay,
  refreshTripDays,
  removeTripDays,
  type SavedDay,
} from './bundle-manager';
import { useTripDayServices } from './services';

const SAVED_SQL = `SELECT l.data, t.id AS trip_id, d.name AS destination_name
  FROM local_private l
  JOIN trips t ON l.id LIKE '${BUNDLE_KIND}:' || t.id || ':%'
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE l.kind = ?`;

/** The days of each saved trip's plan that are spent in an area of their own (day trips). */
const AREA_DAYS_SQL = `SELECT d.trip_id, d.date, d.destination_id, t.destination_id AS trip_destination_id
  FROM plan_days d JOIN trips t ON t.id = d.trip_id AND t.current_version_id = d.version_id
  WHERE d.destination_id IS NOT NULL AND d.date IS NOT NULL`;

export interface SavedTrip {
  readonly tripId: string;
  readonly name: string;
  readonly kinds: readonly string[];
  readonly bytes: number;
  /**
   * The areas whose map the saved days hold, the trip's city first ("Cusco", "Machu Picchu");
   * empty for a trip that holds its own city's map alone, whose row reads as it always has.
   */
  readonly mapAreas?: readonly string[] | undefined;
}

export interface StorageSettingsViewProps {
  readonly trips: readonly SavedTrip[];
  readonly auto: boolean;
  readonly onAuto: (next: boolean) => void;
  readonly onSave: (tripId: string) => void;
  readonly onRemove: (tripId: string) => void;
  /** The remove confirmation, over the whole page. */
  readonly sheet?: ReactNode;
}

export function StorageSettingsView({
  trips,
  auto,
  onAuto,
  onSave,
  onRemove,
  sheet,
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
  const mapsOf = (names: string) =>
    t({ id: 'trip.offline.kind.mapsOf', message: `maps of ${names}` });
  const rows: SettingsRow[] = trips.flatMap((trip) => {
    const size = format.number(locale, trip.bytes / (1024 * 1024), { maximumFractionDigits: 0 });
    const name = trip.name;
    const areas = trip.mapAreas ?? [];
    const what = trip.kinds
      .map((kind) =>
        kind === 'map_region' && areas.length > 0
          ? mapsOf(format.list(locale, [...areas]))
          : kindName(kind),
      )
      .join(', ');
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
      {sheet}
    </Scaffold>
  );
}

export function StorageSettingsScreen() {
  const { db } = useLocalFirst();
  const { t } = useLingui();
  const services = useTripDayServices();
  const [removing, setRemoving] = useState<string | null>(null);
  const saved = useLiveRows<{ data: string; trip_id: string; destination_name: string | null }>(
    SAVED_SQL,
    [BUNDLE_KIND],
    ['local_private', 'trips', 'destinations'],
  ).rows;
  const auto = autoDownloadOn(
    useLiveRows<{ data: string }>(AUTO_SQL, [AUTO_ID], ['local_private']).rows,
  );
  // Day trips of the saved trips: the area each such day is spent in, named by its link.
  const areasOn = useTripAreasOn();
  const areaDays = useLiveRows<{
    trip_id: string;
    date: string;
    destination_id: string;
    trip_destination_id: string | null;
  }>(AREA_DAYS_SQL, areasOn ? [] : null, ['plan_days', 'trips']).rows;
  const links = useAreaLinks(
    areaDays.flatMap((day) => (day.trip_destination_id === null ? [] : [day.trip_destination_id])),
  ).links;
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
        return one.trip_id === row.trip_id && name !== undefined ? [[one.date, name] as const] : [];
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
      onRemove={setRemoving}
      sheet={
        removing === null ? null : (
          <Sheet
            detents={['fit']}
            onDismiss={() => setRemoving(null)}
            accessibilityLabel={t({
              id: 'trip.offline.removeConfirmTitle',
              message: 'Take this trip off this phone?',
            })}
            testID="trip-offline-remove-sheet"
          >
            <ConfirmSheet
              title={t({
                id: 'trip.offline.removeConfirmTitle',
                message: 'Take this trip off this phone?',
              })}
              consequences={[
                t({
                  id: 'trip.offline.removeConfirmLine',
                  message: 'Its tickets and maps will need signal until you save it again.',
                }),
              ]}
              confirmLabel={t({ id: 'trip.offline.remove', message: 'Remove' })}
              onConfirm={() => {
                void removeTripDays(db, services, removing);
                setRemoving(null);
              }}
              onCancel={() => setRemoving(null)}
            />
          </Sheet>
        )
      }
    />
  );
}
