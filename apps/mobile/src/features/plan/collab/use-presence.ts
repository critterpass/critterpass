/**
 * Plan presence on `trip_presence:{trip}` (docs/api-contracts-async.md §1): I say where I am
 * (`here{screen, day}`, again whenever someone joins so they see me too) and where my attention is
 * (`cursor{anchor}`: the option I'm on). Cursors go through the publish proxy at most 5 times a second, latest wins, and
 * `null` on the way out. Peers' cursors are kept with when they last moved, so the screen can
 * glide them and fade them after 3 s of stillness. Anchors are element ids, never coordinates.
 */
/* eslint-disable lingui/no-unlocalized-strings -- channel names and event types, never copy. */
import { planAnchor, type PlanPresenceScreen, type RtEnvelope } from '@cp/domain';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createAnchorPublisher } from '@/data/realtime/use-anchored-presence';
import { useChannel, useRealtimeClient } from '@/data/realtime/use-channel';
import { usePresence, type PresenceMember } from '@/data/realtime/use-presence';

/** Plan presence rides the trip's presence channel. */
export const PRESENCE_NAMESPACE = 'trip_presence' as const;

/** The anchor for a decision option. */
export function optionAnchor(optionId: string): string {
  return planAnchor('poll_option', optionId);
}

export interface PeerCursor {
  readonly uid: string;
  readonly anchor: string;
  /** `Date.now()` of the latest move. */
  readonly at: number;
}

export interface PlanPresence {
  /** Other people on this screen and day right now. */
  readonly here: readonly PresenceMember[];
  readonly cursors: readonly PeerCursor[];
  /** My anchor (null clears it). */
  readonly setCursor: (anchor: string | null) => void;
}

interface Place {
  readonly screen: string;
  readonly day: number | null;
}

function dataOf(envelope: RtEnvelope): Record<string, unknown> {
  return typeof envelope.data === 'object' && envelope.data !== null
    ? (envelope.data as Record<string, unknown>)
    : {};
}

export function usePlanPresence(
  tripId: string | null,
  screen: PlanPresenceScreen,
  day: number | null,
): PlanPresence {
  const client = useRealtimeClient();
  const members = usePresence('trip_presence', tripId);
  const [places, setPlaces] = useState<ReadonlyMap<string, Place>>(new Map());
  const [cursors, setCursors] = useState<ReadonlyMap<string, PeerCursor>>(new Map());
  const mine = useRef<string | null>(null);

  const subscription = () =>
    tripId === null ? undefined : client?.channels.subscription('trip_presence', tripId);
  const sayHere = () => {
    void subscription()
      ?.publish({ type: 'here', data: { screen, day } })
      .catch(() => undefined);
  };

  const publisher = useMemo(
    () =>
      createAnchorPublisher({
        publish: (anchor) =>
          (tripId === null
            ? undefined
            : client?.channels.subscription('trip_presence', tripId)
          )?.publish({ type: 'cursor', data: { anchor } }),
      }),
    [client, tripId],
  );

  useEffect(
    () => () => {
      publisher.cancel();
      publisher.set(null);
    },
    [publisher],
  );

  useChannel('trip_presence', tripId, {
    onSubscribed: () => {
      setCursors(new Map());
      publisher.forget();
      publisher.set(mine.current);
      sayHere();
    },
    onJoin: (info) => {
      if (info.user !== client?.uid) sayHere();
    },
    onLeave: (info) => {
      setCursors((current) => {
        if (!current.has(info.user)) return current;
        const next = new Map(current);
        next.delete(info.user);
        return next;
      });
    },
    onEvent: (envelope) => {
      const data = dataOf(envelope);
      const uid = typeof data.uid === 'string' ? data.uid : null;
      if (uid === null || uid === client?.uid) return;
      if (envelope.type === 'here') {
        const place = {
          screen: typeof data.screen === 'string' ? data.screen : '',
          day: typeof data.day === 'number' ? data.day : null,
        };
        setPlaces((current) => new Map(current).set(uid, place));
      } else if (envelope.type === 'cursor') {
        const anchor = typeof data.anchor === 'string' ? data.anchor : null;
        setCursors((current) => {
          const next = new Map(current);
          if (anchor === null) next.delete(uid);
          else next.set(uid, { uid, anchor, at: Date.now() });
          return next;
        });
      }
    },
  });

  // Say where I am again when I move to another day or screen.
  useEffect(() => {
    sayHere();
    // `sayHere` reads the latest channel; the place is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, day, tripId]);

  const here = members.filter((member) => {
    if (member.uid === client?.uid) return false;
    const place = places.get(member.uid);
    return place !== undefined && place.screen === screen && place.day === day;
  });

  return {
    here,
    cursors: [...cursors.values()],
    setCursor: (anchor) => {
      mine.current = anchor;
      publisher.set(anchor);
    },
  };
}
