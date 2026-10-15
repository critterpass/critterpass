/**
 * Offline storage (9.05) as a push: an ink meter card (what is saved for no signal, the phone's free
 * space, a stacked bar per saved trip with its legend), the saved trips with Save now and Remove
 * (asked first), whether the next trip saves by itself, and Tokek's line. Reads and writes the same
 * trip-day packs as the current page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values and a CSS gradient, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Card,
  GuideNote,
  ListCard,
  PressableScale,
  Row,
  Text,
  Toggle,
  usePremiumTheme,
  useToast,
  type PremiumTheme,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { useOfflineStorage } from './use-offline-storage';

const MB = 1024 * 1024;

function tripColours(theme: PremiumTheme): readonly string[] {
  return [theme.accent.mint, theme.accent.tangerine, theme.accent.sky, theme.accent.pink];
}

function Pill({
  label,
  bg,
  fg,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly bg: string;
  readonly fg: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: bg }]}
      testID={testID}
    >
      <Text variant="pillSmall" color={fg}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function OfflineStoragePremiumScreen() {
  const th = usePremiumTheme();
  const locale = useLocale();
  const toast = useToast();
  const { t } = useLingui();
  const store = useOfflineStorage();
  const colours = tripColours(th);
  const mb = (bytes: number) =>
    format.number(locale, bytes / MB, { maximumFractionDigits: bytes < 10 * MB ? 1 : 0 });
  const total = mb(store.totalBytes);
  const free =
    store.freeBytes === null
      ? null
      : format.number(locale, store.freeBytes / (1024 * MB), { maximumFractionDigits: 1 });
  const span = store.totalBytes + Math.max(store.freeBytes ?? 0, store.totalBytes * 0.12);
  const kindName = (kind: string) =>
    kind === 'attachment'
      ? t({ id: 'trip.offline.kind.bookings', message: 'Bookings' })
      : kind === 'map_region'
        ? t({ id: 'trip.offline.kind.maps', message: 'maps' })
        : t({ id: 'trip.offline.kind.phrases', message: 'phrases' });

  const save = (tripId: string) =>
    void store.save(tripId).then((outcome) =>
      toast.show(
        outcome === 'saved'
          ? {
              kind: 'done',
              message: t({
                id: 'trip.offline.savedToast',
                message: 'Saved. Today works with no signal.',
              }),
            }
          : {
              kind: 'error',
              message: t({
                id: 'trip.offline.saveFailed',
                message: 'Needs signal to save. Try again when you have it.',
              }),
            },
      ),
    );
  const remove = async (tripId: string) => {
    const ok = await confirmAlert({
      title: t({
        id: 'trip.offline.removeConfirmTitle',
        message: 'Take this trip off this phone?',
      }),
      message: t({
        id: 'trip.offline.removeConfirmLine',
        message: 'Its tickets and maps will need signal until you save it again.',
      }),
      confirm: t({ id: 'trip.offline.remove', message: 'Remove' }),
      cancel: t({ id: 'you.premium.offline.keep', message: 'Keep it' }),
    });
    if (ok) store.remove(tripId);
  };

  return (
    <PushScreen
      title={t({ id: 'trip.offline.storageTitle', message: 'Offline' })}
      backLabel={t({ id: 'trip.offline.backToSettings', message: 'Settings' })}
      testID="trip-offline-storage"
    >
      <View style={[styles.content, { paddingHorizontal: th.space.gap16 }]}>
        <View
          style={[
            styles.meter,
            {
              backgroundColor: th.color.inkSurface,
              experimental_backgroundImage: `radial-gradient(circle at 90% 0%, ${th.accent.mint}55 0%, transparent 55%)`,
            },
          ]}
          testID="offline-meter"
        >
          <Text variant="label" color={th.color.onInkSurface} style={styles.soft}>
            {t({ id: 'you.premium.offline.savedFor', message: 'Saved for no signal' })}
          </Text>
          <View style={styles.totalLine}>
            <Text variant="display" color={th.color.onInkSurface}>
              {total}
            </Text>
            <Text variant="title" color={th.color.onInkSurface} style={styles.soft}>
              MB
            </Text>
            <View style={styles.grow} />
            {free === null ? null : (
              <Text variant="caption" color={th.color.onInkSurface} style={styles.soft}>
                {t({ id: 'you.premium.offline.free', message: `${free} GB free` })}
              </Text>
            )}
          </View>
          <View style={styles.bar}>
            {store.trips.map((trip, index) => (
              <View
                key={trip.tripId}
                style={{
                  flex: Math.max(trip.bytes, 1) / Math.max(span, 1),
                  backgroundColor: colours[index % colours.length],
                  borderRadius: 5,
                }}
              />
            ))}
            <View
              style={{
                flex: Math.max(span - store.totalBytes, 1) / Math.max(span, 1),
                // The free part of the bar is a faint track on the dark card: at 0 MB it reads empty.
                backgroundColor: th.color.onInkSurface,
                opacity: 0.14,
                borderRadius: 5,
              }}
            />
          </View>
          <View style={styles.legend}>
            {store.trips.map((trip, index) => (
              <View key={trip.tripId} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: colours[index % colours.length] }]} />
                <Text variant="captionMuted" color={th.color.onInkSurface}>
                  {`${trip.name} ${mb(trip.bytes)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {store.trips.length === 0 ? (
          <Card padded radius={th.radius.cardLarge}>
            <Text variant="body" tone="muted">
              {t({
                id: 'trip.offline.nothingSaved',
                message: 'No trip is saved on this phone yet.',
              })}
            </Text>
          </Card>
        ) : (
          <ListCard testID="offline-trips">
            {store.trips.map((trip, index) => {
              const what = trip.kinds.map(kindName).join(', ');
              const size = mb(trip.bytes);
              return (
                <Row
                  key={trip.tripId}
                  title={trip.name}
                  subtitle={[what, t({ id: 'trip.offline.size', message: `${size} MB` })]
                    .filter(Boolean)
                    .join(' · ')}
                  leading={
                    <View
                      style={[styles.tile, { backgroundColor: colours[index % colours.length] }]}
                    />
                  }
                  trailing={
                    <View style={styles.pills}>
                      <Pill
                        label={t({ id: 'you.premium.offline.saveNow', message: 'Save now' })}
                        bg={th.color.ink}
                        fg={th.color.onInk}
                        onPress={() => save(trip.tripId)}
                        testID={`offline-save-${trip.tripId}`}
                      />
                      <Pill
                        label={t({ id: 'trip.offline.remove', message: 'Remove' })}
                        bg={th.color.status.voteOpen.bg}
                        fg={th.color.status.voteOpen.text}
                        onPress={() => void remove(trip.tripId)}
                        testID={`offline-remove-${trip.tripId}`}
                      />
                    </View>
                  }
                  testID={`offline-trip-${trip.tripId}`}
                />
              );
            })}
          </ListCard>
        )}

        <ListCard>
          <Row
            title={t({
              id: 'you.premium.offline.auto',
              message: 'Save the next trip automatically',
            })}
            trailing={
              <Toggle
                value={store.auto}
                onChange={store.setAuto}
                accessibilityLabel={t({
                  id: 'you.premium.offline.auto',
                  message: 'Save the next trip automatically',
                })}
                testID="trip-offline-auto"
              />
            }
          />
          <Row
            title={t({ id: 'you.premium.offline.wifiOnly', message: 'Only on Wi-Fi' })}
            trailing={
              <Toggle
                value={store.wifiOnly}
                onChange={store.setWifiOnly}
                disabled={!store.auto}
                accessibilityLabel={t({
                  id: 'you.premium.offline.wifiOnly',
                  message: 'Only on Wi-Fi',
                })}
                testID="trip-offline-wifi-only"
              />
            }
          />
        </ListCard>

        <GuideNote
          name="Tokek"
          text={t({
            id: 'you.premium.offline.tokek',
            message: 'I pack the next trip in the days before you fly, whenever the app is open.',
          })}
        />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  // The meter keeps clear of the header's back circle.
  content: { gap: 16, paddingTop: 16, paddingBottom: 40 },
  meter: { borderRadius: 28, padding: 18, gap: 10 },
  soft: { opacity: 0.75 },
  totalLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  grow: { flex: 1 },
  bar: { flexDirection: 'row', height: 10, gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tile: { width: 50, height: 50, borderRadius: 15 },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
});
