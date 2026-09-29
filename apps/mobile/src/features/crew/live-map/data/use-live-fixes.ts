/**
 * The crew live map's live state: the snapshot on open and on every (re)subscribe to
 * `trip_locations:{trip}` (the channel keeps no history for positions), then each publication as
 * it arrives. Closed answers become the gate (Boost needed, outside trip days, off the trip).
 * Offline, what is on screen stays, marked with the time of its last update.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: gate states, wire codes and
   channel names, never copy. */
import { parseLiveMapMessage } from '@cp/domain';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useChannel } from '@/data/realtime/use-channel';

import { applyLiveMessage, EMPTY_LIVE_STATE, fromSnapshot, type LiveState } from './live-state';
import { useLiveMapServices } from './services';

export type LiveGate =
  | 'loading'
  | 'open'
  /** Not boosted (or the Boost ended mid-trip). */
  | 'boost_required'
  /** Boosted, but not in trip days (before the trip or after last-day midnight). */
  | 'outside_trip_days'
  /** Not a participant any more. */
  | 'not_on_trip';

export interface LiveFixes {
  readonly state: LiveState;
  readonly gate: LiveGate;
  readonly offline: boolean;
  readonly reload: () => void;
}

export function gateOf(code: string, reason: string | null): LiveGate {
  if (code === 'ENTITLEMENT_REQUIRED') return 'boost_required';
  if (reason === 'outside_trip_days') return 'outside_trip_days';
  return 'not_on_trip';
}

export function useLiveFixes(tripId: string, me: string | null): LiveFixes {
  const services = useLiveMapServices();
  const { network } = useLocalFirst();
  const online = useSyncExternalStore(
    (listener) => network.subscribe(listener),
    () => network.isOnline(),
  );
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);
  const [gate, setGate] = useState<LiveGate>('loading');
  const [unreachable, setUnreachable] = useState(false);
  const generation = useRef(0);

  const reload = useCallback(() => {
    const mine = ++generation.current;
    void services.loadSnapshot(tripId).then((result) => {
      if (mine !== generation.current) return;
      if (result.kind === 'ok') {
        setState(fromSnapshot(result.snapshot, services.now()));
        setGate('open');
        setUnreachable(false);
      } else if (result.kind === 'closed') {
        // Nobody's history is kept once the map closes: positions go with it.
        setState((current) => ({ ...current, members: new Map(), etas: new Map() }));
        setGate(gateOf(result.code, result.reason));
        setUnreachable(false);
      } else {
        setUnreachable(true);
        setGate((current) => (current === 'loading' ? 'open' : current));
      }
    });
  }, [services, tripId]);

  // On open, and again whenever the phone comes back online.
  useEffect(() => {
    if (online) reload();
  }, [reload, online]);

  useChannel('trip_locations', gate === 'open' || gate === 'loading' ? tripId : null, {
    onSubscribed: reload,
    onChannelReset: reload,
    onEvent: (envelope) => {
      const message = parseLiveMapMessage(envelope.type, envelope.data);
      if (message === null) return;
      if (message.type === 'share.ended') {
        const { reason, uid } = message.data;
        // The map closing for everyone, or for me: the snapshot answers with the gate.
        if (reason === 'window_ended' || reason === 'boost_ended' || uid === me) reload();
      }
      setState((current) => applyLiveMessage(current, message, services.now()));
    },
  });

  const offline = unreachable || !online;
  return { state, gate, offline, reload };
}
