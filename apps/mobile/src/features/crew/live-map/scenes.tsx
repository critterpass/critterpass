/**
 * Fixed crew live map scenes for the developer tools and device screenshots: the live view the
 * design shows (3g-4) and each state around it, drawn by the real view from a recorded snapshot
 * with the clock pinned to 16:38 in Ubud. No network, no location, no local database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data and scene ids, never copy. */
import { i18n } from '@lingui/core';
import { useMemo, useState } from 'react';

import { liveSnapshotSchema } from '@cp/domain';

import { fromSnapshot } from './data/live-state';
import { memberRows } from './data/use-member-etas';
import { meetupSnapshotOf } from './data/use-meetup-snapshot';
import { foldTrails, visibleTrails } from './data/use-trails';
import type { TripCrew } from './data/use-trip-crew';
import { buildLiveView } from './data/view-model';
import { clock } from './copy';
import type { LiveMapModel, Overlay } from './model';
import { LiveMapView } from './screen';
import { ALEX, DEV, JORDAN, MAYA, NOW, RIN, TRIP } from './test-support/ids';
import recorded from './test-support/snapshot.fixture.json';

export const LIVE_MAP_SCENES = [
  'live',
  'boost-gate',
  'not-started',
  'offline',
  'paused',
  'no-meetup',
  'arrived',
  'no-pack',
] as const;
export type LiveMapSceneName = (typeof LIVE_MAP_SCENES)[number];

const ME = '0199a6f0-0000-7000-8000-0000000000a6';

const crew: TripCrew = {
  tripId: TRIP,
  crewId: 'crew',
  crewName: 'The Bali Six',
  destinationId: null,
  destinationSlug: 'bali',
  destinationName: 'Bali',
  status: 'in_trip',
  startDate: '2026-10-15',
  endDate: '2026-10-19',
  tz: 'Asia/Makassar',
  boosted: true,
  members: [
    [MAYA, 'Maya'],
    [RIN, 'Rin'],
    [ALEX, 'Alex'],
    [JORDAN, 'Jordan'],
    [DEV, 'Dev'],
    [ME, 'Sam'],
  ].map(([uid, name], joinIndex) => ({ uid: uid ?? '', name: name ?? '', joinIndex, phone: null })),
  myShare: { id: 'mine', paused: false },
  meetup: null,
};

function snapshotFor(scene: LiveMapSceneName) {
  const base = liveSnapshotSchema.parse(recorded);
  const shares = base.shares.map((share) =>
    share.uid === DEV ? { ...share, paused: true, changed_at: '2026-10-18T06:00:00.000Z' } : share,
  );
  const withMe = [
    ...shares,
    {
      uid: ME,
      share_id: 'mine',
      paused: scene === 'paused',
      changed_at: '2026-10-18T08:00:00.000Z',
    },
  ];
  if (scene === 'no-meetup') return { ...base, shares: withMe, meetup: null, etas: [] };
  if (scene === 'arrived') {
    return {
      ...base,
      shares: withMe,
      etas: base.etas.map((eta) => ({
        ...eta,
        min: 0,
        arrived: true,
        status: { key: 'arrived' as const, poi: null, distance_m: 20 },
      })),
    };
  }
  return { ...base, shares: withMe };
}

function sceneModel(
  scene: LiveMapSceneName,
  overlay: Overlay,
  setOverlay: (o: Overlay) => void,
): LiveMapModel {
  const locale = i18n.locale;
  const tz = crew.tz;
  const state = fromSnapshot(snapshotFor(scene), NOW);
  const ownFix =
    scene === 'paused' ? null : { lat: -8.5058, lng: 115.2569, acc: 8, at: NOW - 5000 };
  const view = buildLiveView({ crew, state, me: ME, ownFix, now: NOW });
  const trail = foldTrails(
    foldTrails(
      new Map(),
      new Map([
        [
          JORDAN,
          {
            uid: JORDAN,
            lat: -8.5099,
            lng: 115.2815,
            acc: 10,
            activity: 'automotive' as const,
            at: NOW - 20_000,
          },
        ],
      ]),
    ),
    new Map([
      [
        JORDAN,
        {
          uid: JORDAN,
          lat: -8.5095,
          lng: 115.2795,
          acc: 10,
          activity: 'automotive' as const,
          at: NOW - 10_000,
        },
      ],
    ]),
  );
  const gate =
    scene === 'boost-gate'
      ? 'boost_required'
      : scene === 'not-started'
        ? 'outside_trip_days'
        : 'open';
  const meetup = state.meetup;
  return {
    tripId: TRIP,
    me: ME,
    crewName: crew.crewName,
    destinationId: null,
    // A slug the tiles host has never heard of: the destination has no region pack.
    destinationSlug: scene === 'no-pack' ? 'lab-no-region-pack' : crew.destinationSlug,
    destinationName: crew.destinationName,
    gate,
    offline: scene === 'offline',
    updatedAt: NOW - 4 * 60_000,
    view,
    rows: memberRows(view, tz, locale, NOW),
    trails: visibleTrails(trail, NOW),
    meetup,
    meetupTime: meetup === null ? null : clock(Date.parse(meetup.meet_at), tz, locale),
    meetupPending: false,
    snapshot: meetupSnapshotOf(view),
    ownFix,
    tz,
    locale,
    now: NOW,
    endsOn: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date('2026-10-19T04:00:00Z'),
    ),
    windowStartsAt: scene === 'not-started' ? new Date('2026-10-14T16:00:00Z') : null,
    windowEnded: false,
    locationOff: false,
    whileInUse: false,
    lowPower: false,
    overlay,
    pinging: false,
    setOverlay,
    turnOn: () => undefined,
    togglePause: () => undefined,
    confirmMeetup: () => setOverlay({ kind: 'none' }),
    ping: () => undefined,
    openSettings: () => undefined,
    offerAlways: () => undefined,
    dragTick: () => undefined,
  };
}

export function LiveMapScene({
  scene,
  onBack,
}: {
  readonly scene: LiveMapSceneName;
  readonly onBack: () => void;
}) {
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const model = useMemo(() => sceneModel(scene, overlay, setOverlay), [scene, overlay]);
  return <LiveMapView model={model} fromChat onBack={onBack} />;
}
