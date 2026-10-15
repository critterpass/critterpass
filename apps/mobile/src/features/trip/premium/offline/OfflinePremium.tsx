/**
 * Offline (6.15): "No signal" (or weak, or back) in an ink chip with the day beside it, a polaroid
 * of the day's headline, what still works on this phone (green), what sends when you're back
 * (dashed chips; one opens its sheet to edit or not send it), what didn't go through once back,
 * and "Open today's plan" with when this phone last synced. Back goes where you came from.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';

import {
  Button,
  Icon,
  PressableScale,
  ring,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { conflictReason } from '../../offline/conflict-reason';
import { useOffline } from '../../offline/use-offline';
import { offlineStorageRoute } from '../../hub/routes';
import { heroStillUri } from '../components/hero-still';
import { turn } from '../components/turn';
import { QueuedSheet } from './QueuedSheet';

/** Clear over the photo's top, dark under the headline so the white reads on any photo. */
const PHOTO_FADE =
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
  'linear-gradient(180deg, rgba(10,10,25,0) 30%, rgba(10,10,25,0.7) 100%)';

export function OfflinePremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { i18n, t } = useLingui();
  const view = useOffline(tripId, { always: true });
  const { width } = useWindowDimensions();
  // The saved copy of the trip's photo, so the polaroid shows the place with no signal.
  const media = useDestinationMedia(view?.card.destinationSlug ?? null, { prefetch: false });
  const photo = heroStillUri(heroAt(media.items), width);
  // Opened with signal, the page is what would still work: an "Online" chip under "Offline" read
  // as a contradiction.
  const title =
    view?.card.chip === 'online'
      ? t({ id: 'trip.offline.premium.readyTitle', message: 'What works offline' })
      : t({ id: 'trip.offline.premium.title', message: 'Offline' });
  const backLabel = t({ id: 'trip.offline.backToTrip', message: 'Trip' });
  if (view === null) {
    return (
      <PushScreen title={title} backLabel={backLabel} testID="trip-offline-page">
        {null}
      </PushScreen>
    );
  }
  const chip =
    view.card.chip === 'online'
      ? t({ id: 'trip.offline.online', message: 'Online' })
      : view.card.chip === 'back'
        ? t({ id: 'trip.offline.backOnline', message: 'Back online' })
        : view.card.chip === 'weak'
          ? t({ id: 'trip.offline.weak', message: 'Weak signal' })
          : t({ id: 'trip.offline.noSignal', message: 'No signal' });
  const waiting = view.sends.filter((line) => !line.sent);
  return (
    <PushScreen title={title} backLabel={backLabel} testID="trip-offline-page">
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap16 }]}>
        <View style={styles.top}>
          <View style={[styles.chip, { backgroundColor: th.color.inkSurface }]}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    view.card.chip === 'online' || view.card.chip === 'back'
                      ? th.accent.mint
                      : th.accent.tangerine,
                },
              ]}
            />
            <Text variant="caption" color={th.color.onInkSurface}>
              {chip}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {view.card.eyebrow}
          </Text>
        </View>
        <View
          style={[
            styles.polaroid,
            {
              transform: [turn(-1.5)],
              backgroundColor: th.color.card,
              borderRadius: th.radius.cardRow,
              boxShadow: th.shadow.photo,
            },
          ]}
        >
          <View style={[styles.photo, { backgroundColor: th.color.inkSurface, borderRadius: 21 }]}>
            {photo === null ? null : (
              <>
                <Image
                  source={{ uri: photo }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <View style={[StyleSheet.absoluteFill, { backgroundImage: PHOTO_FADE }]} />
              </>
            )}
            <Text variant="display" color={th.accent.paper}>
              {view.card.headline}
            </Text>
          </View>
        </View>
        <Text variant="rowText" tone="inkSecondary">
          {view.card.line}
        </Text>
        {view.stillWorks.length === 0 ? null : (
          <View style={{ gap: th.space.gap8 }} testID="trip-offline-still-works">
            <Text variant="label" color={th.color.status.booked.text}>
              {t({ id: 'trip.offline.stillWorks', message: 'Still works' })}
            </Text>
            <View
              style={[
                styles.card,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
            >
              {view.stillWorks.map((line, index) => (
                <View
                  key={line.key}
                  style={[
                    styles.line,
                    index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
                    line.missing === true ? styles.dim : null,
                  ]}
                >
                  <View style={[styles.check, { backgroundColor: th.color.status.booked.bg }]}>
                    <Icon
                      name={line.missing === true ? 'close' : 'check'}
                      size={12}
                      color={th.color.status.booked.text}
                    />
                  </View>
                  <Text variant="rowText" style={styles.flex}>
                    {line.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {waiting.length === 0 ? null : (
          <View style={{ gap: th.space.gap8 }} testID="trip-offline-sends">
            <Text variant="label" color={th.color.status.tangerine.text}>
              {t({ id: 'trip.offline.sendsTitle', message: 'Sends when you’re back' })}
            </Text>
            <View style={styles.chips}>
              {waiting.map((line) => (
                <PressableScale
                  key={line.opId}
                  onPress={() => view.onOpenSend(line.opId)}
                  accessibilityRole="button"
                  testID={`trip-offline-send-${line.opId}`}
                >
                  <View style={[styles.queued, { borderColor: th.color.outlineEmpty }]}>
                    <Text variant="caption">{i18n._(line.summary)}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
        )}
        {view.conflicts.length === 0 ? null : (
          <View
            style={[
              styles.card,
              styles.conflicts,
              {
                borderRadius: th.radius.card,
                backgroundColor: th.color.card,
                boxShadow: ring(1, th.color.destructive.fieldRing, true),
              },
            ]}
            testID="trip-offline-conflicts"
          >
            <Text variant="label" color={th.color.destructive.text}>
              {t({ id: 'trip.offline.conflictsTitle', message: 'Didn’t go through' })}
            </Text>
            {view.conflicts.map((item) => (
              <View key={item.opId} style={styles.line}>
                <View style={styles.flex}>
                  <Text variant="rowTitle">{i18n._(item.summary)}</Text>
                  <Text variant="captionMuted" tone="muted">
                    {i18n._(conflictReason(item.code))}
                  </Text>
                </View>
                <TextButton
                  label={t({ id: 'trip.offline.conflictOk', message: 'OK' })}
                  onPress={() => view.onDismissConflict(item.opId)}
                  testID={`trip-offline-conflict-${item.opId}`}
                />
              </View>
            ))}
          </View>
        )}
        {view.onOpenPlan === null ? null : (
          <Button
            label={t({ id: 'trip.offline.premium.openPlan', message: 'Open today’s plan' })}
            onPress={view.onOpenPlan}
            testID="trip-offline-plan"
          />
        )}
        {view.lastSynced === null ? null : (
          <Text variant="caption" tone="muted" align="center">
            {t({ id: 'trip.offline.lastSynced', message: `Last synced ${view.lastSynced}` })}
          </Text>
        )}
        <View style={styles.center}>
          <Button
            variant="secondary"
            size="medium"
            icon="download"
            label={t({ id: 'trip.offline.storageLink', message: 'Trips saved on this phone' })}
            onPress={() => router.push(offlineStorageRoute())}
            testID="trip-offline-storage-link"
          />
        </View>
      </View>
      {view.queued == null ? null : <QueuedSheet {...view.queued} />}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  polaroid: { padding: 6 },
  photo: { minHeight: 150, justifyContent: 'flex-end', padding: 16, overflow: 'hidden' },
  card: { overflow: 'hidden', paddingHorizontal: 14 },
  conflicts: { paddingVertical: 12, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
  dim: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  queued: {
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  center: { alignItems: 'center' },
});
