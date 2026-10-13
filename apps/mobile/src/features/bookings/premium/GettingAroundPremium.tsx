/**
 * Getting around (5.24): the map with where you are and where you are going, the glass back and
 * the ink route pill ("Airport → Villa · 1h 05m"), then a sheet: the booked transfer, or the
 * ride (fares with "why this estimate", the ride apps), "I'm in the car" and the minutes left, the
 * phrase card for the driver (it stays light), and later today's legs with their ride links.
 */
import { useLingui } from '@lingui/react/macro';
import { Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RideBackCardPremium } from '@/features/drivers';
import { PremiumMapCanvas, StayFlag } from '@/features/plan';
import { IconTile } from '@/features/trip';
import {
  Button,
  EmptyState,
  GlassIconButton,
  PremiumThemeProvider,
  PressableScale,
  ring,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { useGettingAroundScreen } from '../getting-around/use-getting-around-screen';
import { LaterLegs, PhraseCard, RideCard } from './components/GettingAroundParts';

const MAP_HEIGHT = 420;

export function GettingAroundPremium(input: {
  readonly ask: { readonly tripId?: string; readonly to?: string; readonly from?: string };
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const p = useGettingAroundScreen(input);
  const back = t({ id: 'suppliers.premium.back', message: 'Back' });
  if (p.status !== 'ready') {
    return (
      <View
        style={[styles.root, { backgroundColor: th.color.ground, paddingTop: insets.top + 64 }]}
        testID="getting-around"
      >
        <View style={[styles.back, { top: insets.top + 6, left: th.space.gutter }]}>
          <GlassIconButton
            icon="back"
            label={back}
            onPress={() => p.onBack?.()}
            testID="getting-around-back"
          />
        </View>
        {p.status === 'loading' ? (
          <View style={{ padding: th.space.gutter }}>
            <Skeleton height={240} radius={th.radius.cardLarge} />
          </View>
        ) : (
          <EmptyState
            title={
              p.status === 'no_trip'
                ? t({ id: 'suppliers.around.noTrip', message: 'No trip under way' })
                : t({ id: 'suppliers.around.noPlace', message: 'Nothing left to get to today' })
            }
            line={t({
              id: 'suppliers.around.emptyBody',
              message: 'Rides show up here for the places on your plan.',
            })}
          />
        )}
      </View>
    );
  }
  const map = p.map;
  const ride = p.ride;
  const journey = p.journey;
  return (
    <View style={[styles.root, { backgroundColor: th.color.ground }]} testID="getting-around">
      <View style={{ height: MAP_HEIGHT }}>
        {map === null ? null : (
          <PremiumMapCanvas
            cameraRef={camera}
            initialCenter={[map.to.lng, map.to.lat]}
            initialZoom={12}
            destinationSlug={map.destinationSlug}
            still
          >
            <StayFlag
              lngLat={[map.to.lng, map.to.lat]}
              label={map.to.label}
              accessibilityLabel={map.to.label}
            />
            {map.from === null ? null : (
              <Marker lngLat={[map.from.lng, map.from.lat]} anchor="center">
                <View
                  style={[
                    styles.you,
                    { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
                  ]}
                />
              </Marker>
            )}
          </PremiumMapCanvas>
        )}
      </View>
      <View style={[styles.header, { top: insets.top + 6, paddingHorizontal: th.space.gutter }]}>
        <GlassIconButton
          icon="back"
          label={back}
          onPress={() => p.onBack?.()}
          testID="getting-around-back"
        />
        {p.header === null ? null : (
          <View style={[styles.pill, { backgroundColor: th.color.inkSurface }]}>
            <Text variant="pillSmall" color={th.color.onInkSurface} numberOfLines={1}>
              {p.header}
            </Text>
          </View>
        )}
        <View style={styles.spacer} />
      </View>
      <View
        style={[styles.sheet, { backgroundColor: th.color.ground, boxShadow: th.shadow.toast }]}
      >
        <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: th.space.gutter,
            paddingBottom: insets.bottom + 24,
            gap: th.space.gap12,
          }}
        >
          {p.tripId === null ? null : <RideBackCardPremium tripId={p.tripId} date={p.today} />}
          {p.transfer === null ? null : (
            <PressableScale
              onPress={p.transfer.onOpen}
              accessibilityRole="button"
              testID="getting-around-transfer"
            >
              <View
                style={[
                  styles.row,
                  styles.card,
                  {
                    borderRadius: th.radius.cardRow,
                    backgroundColor: th.color.card,
                    boxShadow: th.shadow.card,
                  },
                ]}
              >
                <IconTile
                  name="car"
                  bg={th.color.status.maybe.bg}
                  color={th.color.status.maybe.text}
                  size={48}
                />
                <View style={styles.flex}>
                  <Text variant="rowTitle">{p.transfer.line}</Text>
                  {p.transfer.when === null ? null : (
                    <Text variant="caption" tone="muted">
                      {p.transfer.when}
                    </Text>
                  )}
                </View>
              </View>
            </PressableScale>
          )}
          {ride === null ? null : <RideCard ride={ride} />}
          {journey === null ? null : (
            <View style={styles.row}>
              {journey.startedAt === null ? (
                <Button
                  label={t({ id: 'suppliers.journey.start', message: "I'm in the car" })}
                  size="medium"
                  variant="secondary"
                  onPress={journey.onStart}
                  testID="getting-around-start"
                />
              ) : (
                <Text variant="rowTextStrong" style={styles.flex}>
                  {t({ id: 'suppliers.premium.onTheWay', message: 'On the way · estimate' })}
                </Text>
              )}
              <TextButton
                label={t({ id: 'suppliers.journey.log', message: 'Log it' })}
                onPress={journey.onLog}
                testID="getting-around-log"
              />
            </View>
          )}
          {p.phrase === null ? null : (
            <PremiumThemeProvider scheme="light">
              <PhraseCard
                phrase={p.phrase.phrase}
                gloss={p.phrase.gloss}
                eyebrow={p.phrase.eyebrow}
              />
            </PremiumThemeProvider>
          )}
          <LaterLegs later={p.later} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { position: 'absolute', zIndex: 2 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  pill: {
    flex: 1,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { width: 44 },
  sheet: {
    flex: 1,
    marginTop: -40,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 8,
    gap: 8,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3 },
  card: { padding: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  you: { width: 16, height: 16, borderRadius: 8 },
});
