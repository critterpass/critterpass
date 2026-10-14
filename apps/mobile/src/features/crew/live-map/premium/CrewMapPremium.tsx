/**
 * The crew map (6.10–6.13) on the premium map: each sharing crewmate as their avatar (a bunch as a
 * stack), the meet-up as the ink flag, you as a sky dot; the ink pill "The Bali Six · 5 of 6
 * sharing" between the back and broadcast circles; the panel with the meet-up, who arrives when
 * and the pings. Offline the map greys and the pings wait. Before trip days the map sleeps under
 * a card with what can be done meanwhile; on an unboosted trip the Boost card sits over it.
 */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveMapGatePremium } from '@/features/monetize';
import { PremiumMapCanvas } from '@/features/plan';
import { GlassIconButton, Text, usePremiumTheme } from '@/ui/premium';
import { SCROLL_EDGE_FADE, ScrollEdgeFade } from '@/ui/premium/shell';

import { liveMapPaywall } from '../gate-slot';
import { PreviewFaces, PreviewPill } from './crew-map-preview';
import { useLiveMapScreen } from '../use-live-map-screen';
import { CrewPanel } from './CrewPanel';
import { Pins, Sleeping } from './crew-map-marks';
import { useDestinationCentre } from './use-destination-centre';
import { MeetupEditorPremium } from './MeetupEditorPremium';

/** Where the map opens with nothing to frame yet: the trip's own centre is not known. */
const FALLBACK: readonly [number, number] = [115.2625, -8.5069];

export function CrewMapPremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const camera = useRef<CameraRef>(null);
  const m = useLiveMapScreen(tripId);
  const open = m.gate === 'open' || m.gate === 'loading';
  const destination = useDestinationCentre(m.destinationId);
  const framed =
    m.meetup !== null
      ? 'meetup'
      : m.ownFix !== null
        ? 'me'
        : destination !== null
          ? 'place'
          : 'none';
  const center: readonly [number, number] =
    m.meetup !== null
      ? [m.meetup.lng, m.meetup.lat]
      : m.ownFix !== null
        ? [m.ownFix.lng, m.ownFix.lat]
        : (destination ?? FALLBACK);
  const sharing = m.view?.sharingCount ?? 0;
  const members = m.view?.memberCount ?? 0;
  const paywall = liveMapPaywall();
  // The faces fill the map between the header and the Boost card.
  const previewHeight = Math.max(0, height * 0.52);
  return (
    <View style={styles.root} testID="live-map-screen">
      {/* The map fills the screen behind the header and the crew panel. The camera only reads its
          first centre, so the map opens again when a better one than the last arrives. */}
      <View style={StyleSheet.absoluteFill}>
        <PremiumMapCanvas
          key={framed}
          cameraRef={camera}
          initialCenter={[center[0], center[1]]}
          initialZoom={14}
          destinationSlug={m.destinationSlug}
          ornamentBottom={360}
        >
          {open ? <Pins m={m} /> : null}
        </PremiumMapCanvas>
      </View>
      {m.offline || !open ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: th.color.ground, opacity: open ? 0.35 : 0.55 },
          ]}
        />
      ) : null}
      {/* The clock and battery read on a fade of the ground, not straight on the map's labels. */}
      <ScrollEdgeFade
        edge="top"
        height={insets.top + SCROLL_EDGE_FADE}
        solid={insets.top / 2}
        testID="live-map-status-ground"
      />
      <View
        style={[
          styles.header,
          { top: insets.top + th.space.gap6, paddingHorizontal: th.space.gutter },
        ]}
      >
        <GlassIconButton
          icon="back"
          label={t({ id: 'liveMap.premium.back', message: 'Back' })}
          onPress={() => router.back()}
          testID="live-map-back"
        />
        <View style={styles.middle}>
          {m.gate === 'boost_required' ? (
            <PreviewPill place={m.destinationName ?? m.crewName} />
          ) : (
            <View style={[styles.pill, { backgroundColor: th.color.inkSurface }]}>
              {/* A long crew name gives way, the count always shows whole. */}
              <View style={styles.pillLine}>
                <Text
                  variant="pillSmall"
                  color={th.color.onInkSurface}
                  numberOfLines={1}
                  singleLine={false}
                  style={styles.pillName}
                >
                  {m.crewName}
                </Text>
                {open && members > 0 ? (
                  <Text variant="pillSmall" color={th.color.onInkSurface} numberOfLines={1}>
                    {t({
                      id: 'liveMap.premium.pillCount',
                      message: ` · ${sharing} of ${members} sharing`,
                    })}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        </View>
        <View style={styles.circle} />
      </View>
      {m.offline ? (
        <View style={[styles.offline, { top: insets.top + 60 }]}>
          <View
            style={[
              styles.offlinePill,
              { backgroundColor: th.color.card, boxShadow: th.shadow.float },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: th.accent.tangerine }]} />
            <Text variant="caption" color={th.color.status.tangerine.text}>
              {t({ id: 'liveMap.offline.none', message: 'Offline · waiting for the crew' })}
            </Text>
          </View>
        </View>
      ) : null}
      {m.gate === 'boost_required' ? <PreviewFaces m={m} height={previewHeight} /> : null}
      <View style={styles.fill} pointerEvents="box-none">
        {m.gate === 'outside_trip_days' ? <Sleeping m={m} /> : null}
      </View>
      {/* The panel's ground runs to the screen's foot; only its buttons keep clear of the home bar. */}
      <View style={m.gate === 'boost_required' ? { paddingBottom: insets.bottom } : null}>
        {open ? (
          <CrewPanel m={m} bottomInset={insets.bottom} />
        ) : m.gate === 'boost_required' ? (
          <LiveMapGatePremium
            place={m.destinationName ?? m.crewName}
            price={null}
            onBoost={() => paywall?.(tripId)}
            onLater={() => router.back()}
          />
        ) : null}
      </View>
      {m.overlay.kind === 'editor' ? (
        <MeetupEditorPremium
          mode={m.meetup === null ? 'create' : m.overlay.mode}
          destinationId={m.destinationId}
          near={m.ownFix === null ? null : { lat: m.ownFix.lat, lng: m.ownFix.lng }}
          dropped={m.overlay.dropped}
          currentTime={m.meetupTime}
          onConfirm={(choice) => m.confirmMeetup(m.meetup === null ? 'create' : 'move', choice)}
          onDismiss={() => m.setOverlay({ kind: 'none' })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  middle: { flex: 1, alignItems: 'center' },
  pill: {
    maxWidth: '100%',
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLine: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  pillName: { flexShrink: 1 },
  circle: { width: 44 },
  offline: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  offlinePill: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
