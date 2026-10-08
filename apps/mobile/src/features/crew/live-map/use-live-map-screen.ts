/**
 * The crew live map's controller: synced crew facts, live state, your own fix, the clock and the
 * commands, folded into what the screen draws and the handlers it calls.
 */
import { generateUuidV7, shareWindow, type MeetupWire, type PingAllResult } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { feedback } from '@/motion';
import { toast } from '@/motion/island-toast';
import { usePermission } from '@/lib/permissions';
import { useNow } from '@/lib/time/use-now';
import { offerAlwaysUpgrade } from '@/lib/location/always-upgrade';

import { useMyUid } from '../chat/data/use-my-uid';
import { clock } from './copy';
import {
  createMeetupCommand,
  moveMeetupCommand,
  pauseLocationShareCommand,
  pingAllCommand,
  setLocationShareCommand,
} from './data/live-commands';
import type { LiveMember } from './data/live-state';
import { useLiveFixes } from './data/use-live-fixes';
import { useMemberEtas } from './data/use-member-etas';
import { useMeetupSnapshot } from './data/use-meetup-snapshot';
import { useTrails } from './data/use-trails';
import { useTripCrew } from './data/use-trip-crew';
import { buildLiveView } from './data/view-model';
import { useLiveMapServices, type OwnFix } from './data/services';
import type { LiveMapModel, Overlay } from './model';
import type { MeetupChoice } from './panel/meetup-editor';
import { pingToast } from './panel/ping-actions';

const TICK_MS = 15_000;
const NO_MEMBERS: ReadonlyMap<string, LiveMember> = new Map<string, LiveMember>();

export function useLiveMapScreen(tripId: string): LiveMapModel {
  const services = useLiveMapServices();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const me = useMyUid();
  const crew = useTripCrew(tripId, me);
  const live = useLiveFixes(tripId, me);
  const tick = useNow(TICK_MS);
  // The services' own clock, read again on each tick.
  const now = useMemo(() => {
    void tick;
    return services.now();
  }, [services, tick]);
  const [ownFix, setOwnFix] = useState<OwnFix | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [pendingMeetup, setPendingMeetup] = useState<MeetupWire | null>(null);
  const location = usePermission('location');
  const share = useCommand(setLocationShareCommand);
  const pause = useCommand(pauseLocationShareCommand);
  const create = useCommand(createMeetupCommand);
  const move = useCommand(moveMeetupCommand);
  const pingAll = useCommand(pingAllCommand);

  useEffect(() => services.watchOwnFix(setOwnFix), [services]);

  const view = useMemo(
    () =>
      crew === null || crew === undefined
        ? null
        : buildLiveView({ crew, state: live.state, me, ownFix, now }),
    [crew, live.state, me, ownFix, now],
  );
  const tz = crew?.tz ?? null;
  const emptyView = useMemo(
    () => ({
      people: [],
      pins: [],
      me: null,
      sharingCount: 0,
      memberCount: 0,
      meetup: null,
      allArrived: false,
      allClose: false,
    }),
    [],
  );
  const rows = useMemberEtas(view ?? emptyView, tz, locale, now);
  const trails = useTrails(live.gate === 'open' ? live.state.members : NO_MEMBERS, now);
  const snapshot = useMeetupSnapshot(view ?? emptyView);

  const synced = view?.meetup ?? null;
  // The queued change has landed (synced or published): drop the optimistic copy.
  if (
    pendingMeetup !== null &&
    synced !== null &&
    synced.id === pendingMeetup.id &&
    synced.place_name === pendingMeetup.place_name &&
    Date.parse(synced.meet_at) === Date.parse(pendingMeetup.meet_at)
  ) {
    setPendingMeetup(null);
  }
  const meetup = pendingMeetup ?? synced;

  const window = crew
    ? shareWindow(
        { status: crew.status, startDate: crew.startDate, endDate: crew.endDate, tz: crew.tz },
        new Date(now),
      )
    : null;
  const endsOn =
    window?.endsAt == null
      ? null
      : new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          ...(tz === null ? {} : { timeZone: tz }),
        }).format(new Date(window.endsAt.getTime() - 1));

  const turnOn = useCallback(() => {
    void share.send({ trip_id: tripId, status: 'on' }).then(() => {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an upgrade moment id.
      void offerAlwaysUpgrade('crew_map');
    });
  }, [share, tripId]);

  const togglePause = useCallback(() => {
    const mine = view?.me;
    const shareId =
      (me === null ? undefined : live.state.shares.get(me)?.share_id) ?? crew?.myShare?.id;
    if (mine === undefined || mine === null || shareId === undefined) return;
    void pause.send({ share_id: shareId, paused: mine.sharing !== 'paused' });
  }, [view, me, live.state.shares, crew, pause]);

  const confirmMeetup = useCallback(
    (mode: 'create' | 'move', choice: MeetupChoice) => {
      setOverlay({ kind: 'none' });
      const at =
        choice.inMinutes === null
          ? undefined
          : new Date(services.now() + choice.inMinutes * 60_000).toISOString();
      const place =
        choice.place === null
          ? {}
          : choice.place.kind === 'poi'
            ? { poi_id: choice.place.poiId }
            : { point: { lat: choice.place.lat, lng: choice.place.lng, name: choice.place.name } };
      const optimistic = (id: string, base: MeetupWire | null): MeetupWire | null => {
        if (choice.place === null && base === null) return null;
        const lat =
          choice.place?.kind === 'point' ? choice.place.lat : (base?.lat ?? ownFix?.lat ?? 0);
        const lng =
          choice.place?.kind === 'point' ? choice.place.lng : (base?.lng ?? ownFix?.lng ?? 0);
        return {
          id,
          trip_id: tripId,
          poi_id: choice.place?.kind === 'poi' ? choice.place.poiId : null,
          place_name: choice.place?.name ?? base?.place_name ?? '',
          lat,
          lng,
          meet_at: at ?? base?.meet_at ?? new Date(services.now()).toISOString(),
          created_by: me ?? '',
          status: 'active',
          arrived: {},
        };
      };
      if (mode === 'create') {
        const id = generateUuidV7();
        const payload = {
          trip_id: tripId,
          meetup_id: id,
          at: at ?? new Date(services.now() + 1_800_000).toISOString(),
          ...place,
        };
        void create.send(payload).then((result) => {
          if (result.kind === 'queued') setPendingMeetup(optimistic(id, null));
        });
      } else if (meetup !== null) {
        void move
          .send({ meetup_id: meetup.id, ...place, ...(at === undefined ? {} : { at }) })
          .then((result) => {
            if (result.kind === 'queued') setPendingMeetup(optimistic(meetup.id, meetup));
          });
      }
    },
    [services, tripId, me, ownFix, create, move, meetup],
  );

  const ping = useCallback(
    (kind: 'ping' | 'on_my_way') => {
      void pingAll.send({ trip_id: tripId, kind }).then((result) => {
        if (result.kind === 'applied') {
          const time = meetup === null ? null : clock(Date.parse(meetup.meet_at), tz, locale);
          toast.show({
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast de-dupe key.
            id: `live-ping-${kind}`,
            title: pingToast(result.result as PingAllResult, time),
          });
        } else if (result.kind === 'unavailable') {
          toast.show({
            id: 'live-ping-offline',
            title: t({
              id: 'liveMap.toast.pingOffline',
              message: "Couldn't reach the crew. Try again.",
            }),
          });
        }
      });
    },
    [pingAll, tripId, meetup, tz, locale],
  );

  return {
    tripId,
    me,
    crewName: crew?.crewName ?? '',
    destinationId: crew?.destinationId ?? null,
    destinationSlug: crew?.destinationSlug ?? null,
    destinationName: crew?.destinationName ?? null,
    gate: live.gate,
    offline: live.offline,
    updatedAt: live.state.updatedAt,
    view,
    rows,
    trails,
    meetup,
    meetupTime: meetup === null ? null : clock(Date.parse(meetup.meet_at), tz, locale),
    meetupPending: pendingMeetup !== null,
    snapshot,
    ownFix,
    tz,
    locale,
    now,
    endsOn,
    windowStartsAt: window?.startsAt ?? null,
    windowEnded: window?.state === 'ended',
    locationOff: location.report?.status === 'denied',
    whileInUse: location.report?.status === 'granted' && location.report.level === 'wiu',
    lowPower: services.isLowPowerMode(),
    overlay,
    pinging: pingAll.pending,
    setOverlay,
    turnOn,
    togglePause,
    confirmMeetup,
    ping,
    openSettings: () => void location.openSettings(),
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an upgrade moment id.
    offerAlways: () => void offerAlwaysUpgrade('crew_map'),
    dragTick: () => feedback.emit('tick'),
  };
}
