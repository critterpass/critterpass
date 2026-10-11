/**
 * The crew map (6.10–6.13) on the premium map: each sharing crewmate as their avatar (a bunch as a
 * stack), the meet-up as the ink flag, you as a sky dot; the ink pill "The Bali Six · 5 of 6
 * sharing" between the back and broadcast circles; the panel with the meet-up, who arrives when
 * and the pings. Offline the map greys and the pings wait. Before trip days the map sleeps under
 * a card with what can be done meanwhile; on an unboosted trip the Boost card sits over it.
 */
import { Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveMapGatePremium } from '@/features/monetize';
import { PremiumMapCanvas, StayFlag } from '@/features/plan';
import { crewAccent, guideCritterKind } from '@/features/trip';
import {
  Avatar,
  CritterSticker,
  CrewStack,
  GlassIconButton,
  ring,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { liveMapPaywall } from '../gate-slot';
import type { LiveMapModel } from '../model';
import { useLiveMapScreen } from '../use-live-map-screen';
import { CrewPanel } from './CrewPanel';
import { MeetupEditorPremium } from './MeetupEditorPremium';

/** Where the map opens with nothing to frame yet: the trip's own centre is not known. */
const FALLBACK: readonly [number, number] = [115.2625, -8.5069];

function Pins({ m }: { readonly m: LiveMapModel }) {
  const th = usePremiumTheme();
  const pins = m.view?.pins ?? [];
  return (
    <>
      {pins.map((pin) => {
        if (pin.kind === 'bunch') {
          return (
            <Marker
              key={pin.people.map((p) => p.uid).join('-')}
              lngLat={[pin.lng, pin.lat]}
              anchor="bottom"
            >
              <CrewStack
                members={pin.people.map((p) => ({
                  id: p.uid,
                  name: p.name,
                  color: crewAccent(p.joinIndex),
                }))}
                size={30}
                accessibilityLabel={pin.people.map((p) => p.name).join(', ')}
              />
            </Marker>
          );
        }
        const { person } = pin;
        if (person.position === null || person.isMe) return null;
        return (
          <Marker
            key={person.uid}
            lngLat={[person.position.lng, person.position.lat]}
            anchor="bottom"
          >
            <View
              style={[
                styles.pin,
                person.stale ? styles.stale : null,
                { boxShadow: th.shadow.sticker },
              ]}
            >
              <Avatar name={person.name} color={crewAccent(person.joinIndex)} size={34} ringed />
            </View>
          </Marker>
        );
      })}
      {m.meetup === null ? null : (
        <StayFlag
          lngLat={[m.meetup.lng, m.meetup.lat]}
          label={m.meetupTime}
          accessibilityLabel={m.meetup.place_name}
        />
      )}
      {m.ownFix === null || (m.view?.me?.sharing ?? 'off') === 'off' ? null : (
        <Marker lngLat={[m.ownFix.lng, m.ownFix.lat]} anchor="center">
          <View
            style={[
              styles.you,
              { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
            ]}
          />
        </Marker>
      )}
    </>
  );
}

function Sleeping({ m }: { readonly m: LiveMapModel }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const title = m.windowEnded
    ? t({ id: 'liveMap.gate.endedTitle', message: 'Trip days are over' })
    : m.windowStartsAt === null
      ? t({ id: 'liveMap.gate.notStartedTitle', message: 'Not a trip day yet' })
      : t({ id: 'liveMap.premium.wakesUp', message: 'The map wakes up on your first trip day' });
  return (
    <View
      style={[
        styles.sleep,
        { borderRadius: 30, backgroundColor: th.color.card, boxShadow: th.shadow.card },
      ]}
      testID="live-map-gate"
    >
      <CritterSticker
        kind={guideCritterKind(null)}
        name={t({ id: 'liveMap.premium.guideName', message: 'Tokek' })}
        size={96}
        pose="sleep"
      />
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="rowText" tone="inkSecondary" align="center">
        {m.windowEnded
          ? t({ id: 'liveMap.gate.endedLine', message: 'Sharing switched itself off at midnight.' })
          : t({
              id: 'liveMap.gate.notStartedLine',
              message: 'Sharing opens on your first trip day.',
            })}
      </Text>
    </View>
  );
}

export function CrewMapPremium({ tripId }: { readonly tripId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const m = useLiveMapScreen(tripId);
  const open = m.gate === 'open' || m.gate === 'loading';
  const center: readonly [number, number] =
    m.meetup !== null
      ? [m.meetup.lng, m.meetup.lat]
      : m.ownFix !== null
        ? [m.ownFix.lng, m.ownFix.lat]
        : FALLBACK;
  const sharing = m.view?.sharingCount ?? 0;
  const members = m.view?.memberCount ?? 0;
  const paywall = liveMapPaywall();
  return (
    <View style={styles.root} testID="live-map-screen">
      <PremiumMapCanvas
        cameraRef={camera}
        initialCenter={[center[0], center[1]]}
        initialZoom={14}
        destinationSlug={m.destinationSlug}
        ornamentBottom={360}
      >
        {open ? <Pins m={m} /> : null}
      </PremiumMapCanvas>
      {m.offline || !open ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: th.color.ground, opacity: open ? 0.35 : 0.55 },
          ]}
        />
      ) : null}
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
        <View style={[styles.pill, { backgroundColor: th.color.inkSurface }]}>
          <Text variant="pillSmall" color={th.color.onInkSurface} numberOfLines={1}>
            {open && members > 0
              ? t({
                  id: 'liveMap.premium.pill',
                  message: `${m.crewName} · ${sharing} of ${members} sharing`,
                })
              : m.crewName}
          </Text>
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
      <View style={styles.fill} pointerEvents="box-none">
        {m.gate === 'outside_trip_days' ? <Sleeping m={m} /> : null}
      </View>
      <View style={{ paddingBottom: insets.bottom }}>
        {open ? (
          <CrewPanel m={m} />
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
  pill: {
    flex: 1,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  pin: { borderRadius: 17 },
  stale: { opacity: 0.55 },
  you: { width: 16, height: 16, borderRadius: 8 },
  sleep: { alignItems: 'center', gap: 10, padding: 20 },
});
