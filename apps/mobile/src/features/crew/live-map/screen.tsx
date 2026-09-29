/**
 * Crew live map (3g-4): the hand-drawn map with every sharing crewmate, bunches, trails, the
 * meet-up and your dot; the header pill; the bottom panel with ETAs and actions; and every state
 * around them (gate, first share, offline, permissions, all arrived).
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stack, useTheme } from '@/ui';

import { clock, pinLabel, statusLine } from './copy';
import { LiveMapServicesProvider, type LiveMapServices } from './data/services';
import { lockScreenStarter } from './gate-slot';
import { BunchPill } from './map/bunch-pill';
import { HeaderPill } from './map/header-pill';
import { boundsOf, LiveMapCanvas, type CanvasPin } from './map/live-map-canvas';
import { MeetupPin } from './map/meetup-pin';
import { MemberPin } from './map/member-pin';
import type { LiveMapModel } from './model';
import { MeetupEditor } from './panel/meetup-editor';
import { Panel } from './panel/panel';
import { AllArrived } from './states/all-arrived';
import { GateCard } from './states/gate-card';
import { AlwaysUpgradeBanner, OfflineNote, SelfChips } from './states/map-banners';
import { lastSeenLine, MemberSheet } from './states/member-sheet';
import { SharePrimer } from './states/share-primer';
import { useLiveMapScreen } from './use-live-map-screen';

const DEFAULT_CENTER: readonly [number, number] = [115.2625, -8.5069];

function canvasPins(m: LiveMapModel): CanvasPin[] {
  if (m.view === null || m.gate !== 'open') return [];
  return m.view.pins.map((pin) => {
    const people = pin.kind === 'single' ? [pin.person] : pin.people;
    const lead = people[0];
    const at = lead?.position?.at ?? 0;
    const target =
      pin.kind === 'single'
        ? { lat: pin.person.position?.lat ?? 0, lng: pin.person.position?.lng ?? 0, at }
        : { lat: pin.lat, lng: pin.lng, at };
    const label = pinLabel(people, m.locale);
    const open = () => m.setOverlay({ kind: 'person', people });
    return {
      key: people.map((person) => person.uid).join('+'),
      target,
      node:
        pin.kind === 'single' ? (
          <MemberPin
            person={pin.person}
            status={statusLine(pin.person, m.tz, m.locale, m.now)}
            label={label}
            onPress={open}
          />
        ) : (
          <BunchPill
            people={pin.people}
            place={lead?.eta?.status.poi ?? null}
            label={label}
            onPress={open}
          />
        ),
    };
  });
}

function formatDay(at: Date, locale: string, tz: string | null): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(at);
}

/** The view for a model: the live controller's, or a fixed scene's. */
export function LiveMapView({
  model: m,
  fromChat,
  onBack = () => router.back(),
}: {
  readonly model: LiveMapModel;
  readonly fromChat: boolean;
  readonly onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const theme = useTheme();
  const open = m.gate === 'open' || m.gate === 'loading';
  const view = m.view;
  const meSharing = view?.me?.sharing ?? 'off';
  const center: readonly [number, number] =
    m.meetup !== null
      ? [m.meetup.lng, m.meetup.lat]
      : m.ownFix !== null
        ? [m.ownFix.lng, m.ownFix.lat]
        : DEFAULT_CENTER;
  const you =
    m.ownFix === null || meSharing === 'off' ? null : ([m.ownFix.lng, m.ownFix.lat] as const);
  const pins = canvasPins(m);
  const framed: (readonly [number, number])[] = pins.map((pin) => [pin.target.lng, pin.target.lat]);
  if (m.meetup !== null) framed.push([m.meetup.lng, m.meetup.lat]);
  if (you !== null) framed.push(you);
  const lastUpdate = m.updatedAt === null ? null : clock(m.updatedAt, m.tz, m.locale);
  const lock = lockScreenStarter();
  const footer =
    m.endsOn === null
      ? null
      : t({
          id: 'liveMap.panel.footer',
          message: `Sharing switches itself off on ${m.endsOn} at midnight.`,
        });
  const moveEditor = () => m.setOverlay({ kind: 'editor', mode: 'move', dropped: null });
  const first = m.overlay.kind === 'person' ? m.overlay.people[0] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.map.base }} testID="live-map-screen">
      <LiveMapCanvas
        center={center}
        bounds={boundsOf(framed)}
        padding={{
          top: insets.top + 130,
          bottom: Math.round(height * 0.66),
          left: 120,
          right: 190,
        }}
        pins={pins}
        trails={m.trails}
        joinIndexOf={(uid) => view?.people.find((person) => person.uid === uid)?.joinIndex ?? 0}
        meetup={
          m.meetup === null || !open
            ? null
            : {
                lngLat: [m.meetup.lng, m.meetup.lat],
                node: (
                  <MeetupPin
                    place={m.meetup.place_name}
                    time={m.meetupTime ?? ''}
                    pulse={view?.allClose === true}
                    pending={m.meetupPending}
                    onPress={moveEditor}
                  />
                ),
              }
        }
        you={open ? you : null}
        approximateYou={view?.me?.approximate === true}
        onMeetupDragStart={m.dragTick}
        onMeetupDragged={(point) => m.setOverlay({ kind: 'editor', mode: 'move', dropped: point })}
      />
      <Stack
        gap="8"
        style={{ paddingTop: insets.top + theme.space['8'], paddingHorizontal: theme.space['12'] }}
      >
        <HeaderPill
          crewName={m.crewName}
          sharing={view?.sharingCount ?? 0}
          members={open ? (view?.memberCount ?? 0) : 0}
          closed={!open}
          paused={meSharing === 'paused'}
          fromChat={fromChat}
          onBack={onBack}
        />
        {m.offline ? <OfflineNote lastUpdate={lastUpdate} /> : null}
        {open && m.whileInUse && meSharing === 'live' ? (
          <AlwaysUpgradeBanner onPress={m.offerAlways} />
        ) : null}
        <SelfChips
          approximate={view?.me?.approximate === true}
          savingBattery={m.lowPower && meSharing === 'live'}
        />
      </Stack>
      <View style={{ flex: 1 }} />
      <View
        style={{
          paddingHorizontal: theme.space['12'],
          paddingBottom: insets.bottom + theme.space['8'],
        }}
      >
        {open ? (
          <Panel
            meetup={
              m.meetup === null
                ? null
                : { place: m.meetup.place_name, time: m.meetupTime ?? '', pending: m.meetupPending }
            }
            rows={m.rows}
            myUid={m.me}
            locationOff={m.locationOff}
            offline={m.offline}
            pinging={m.pinging}
            footer={footer}
            top={
              view?.allArrived === true ? (
                <AllArrived />
              ) : meSharing === 'off' && m.gate === 'open' ? (
                <SharePrimer endsLine={footer ?? ''} onShare={m.turnOn} />
              ) : null
            }
            onMove={moveEditor}
            onCreate={() => m.setOverlay({ kind: 'editor', mode: 'create', dropped: null })}
            onPause={m.togglePause}
            onOpenSettings={m.openSettings}
            onLockScreen={lock === null || m.meetup === null ? null : () => lock(m.tripId)}
            onPing={m.ping}
          />
        ) : (
          <GateCard
            gate={m.gate}
            tripId={m.tripId}
            startsOn={
              m.windowStartsAt === null ? null : formatDay(m.windowStartsAt, m.locale, m.tz)
            }
            ended={m.windowEnded}
          />
        )}
      </View>
      {m.overlay.kind === 'editor' ? (
        <MeetupEditor
          mode={m.meetup === null ? 'create' : m.overlay.mode}
          destinationId={m.destinationId}
          near={m.ownFix === null ? null : { lat: m.ownFix.lat, lng: m.ownFix.lng }}
          dropped={m.overlay.dropped}
          currentTime={m.meetupTime}
          onConfirm={(choice) => m.confirmMeetup(m.meetup === null ? 'create' : 'move', choice)}
          onDismiss={() => m.setOverlay({ kind: 'none' })}
        />
      ) : null}
      {m.overlay.kind === 'person' && first !== undefined ? (
        <MemberSheet
          people={m.overlay.people}
          title={pinLabel(m.overlay.people, m.locale)}
          status={statusLine(first, m.tz, m.locale, m.now)}
          lastSeen={lastSeenLine(first, m.now, (at) => clock(at, m.tz, m.locale))}
          onDismiss={() => m.setOverlay({ kind: 'none' })}
        />
      ) : null}
    </View>
  );
}

function LiveMapBody({
  tripId,
  fromChat,
}: {
  readonly tripId: string;
  readonly fromChat: boolean;
}) {
  const model = useLiveMapScreen(tripId);
  return <LiveMapView model={model} fromChat={fromChat} />;
}

export function LiveMapScreen({ services }: { readonly services: LiveMapServices }) {
  const params = useLocalSearchParams<{ tripId: string; from?: string }>();
  return (
    <LiveMapServicesProvider services={services}>
      <LiveMapBody tripId={params.tripId} fromChat={params.from === 'chat'} />
    </LiveMapServicesProvider>
  );
}
