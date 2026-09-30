/**
 * Plan presence on `trip_presence:{trip}` (docs/api-contracts-async.md §1): I say where I am
 * (`here{screen, day}`, again whenever someone joins so they see me too) and where my attention is
 * (`cursor{anchor, offset}`: the item or option I'm on and, while I drag a block, how many minutes
 * it has moved). Cursors go through the publish proxy at most 5 times a second, latest wins, and
 * `null` on the way out. Peers' cursors are kept with when they last moved, so the screen can
 * glide them and fade them after 3 s of stillness. Anchors are element ids, never coordinates.
 */
/* eslint-disable lingui/no-unlocalized-strings -- channel names and event types, never copy. */
import { planAnchor, type PlanPresenceScreen, type RtEnvelope } from '@cp/domain';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createAnchorPublisher } from '@/data/realtime/use-anchored-presence';
import { useChannel, useRealtimeClient } from '@/data/realtime/use-channel';
import { usePresence, type PresenceMember } from '@/data/realtime/use-presence';

/** The anchor for a plan item (its stable id), as every plan surface names it. */
export function itemAnchor(stableId: string): string {
  return planAnchor('plan_item', stableId);
}

/** The anchor for a decision option. */
export function optionAnchor(optionId: string): string {
  return planAnchor('poll_option', optionId);
}

export interface PeerCursor {
  readonly uid: string;
  readonly anchor: string;
  readonly offset: number;
  /** `Date.now()` of the latest move. */
  readonly at: number;
}

export interface PlanPresence {
  /** Other people on this screen and day right now. */
  readonly here: readonly PresenceMember[];
  readonly cursors: readonly PeerCursor[];
  /** My anchor (null clears it) and, while dragging, the minutes moved. */
  readonly setCursor: (anchor: string | null, offset?: number) => void;
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

/** A cursor as the publisher's latest-wins key (anchor and offset travel together). */
function cursorKey(anchor: string | null, offset: number): string | null {
  return anchor === null ? null : JSON.stringify([anchor, offset]);
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
  const mine = useRef<{ anchor: string | null; offset: number }>({ anchor: null, offset: 0 });

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
        publish: (key) => {
          const [anchor, offset] = key === null ? [null, 0] : (JSON.parse(key) as [string, number]);
          const data = offset === 0 ? { anchor } : { anchor, offset };
          return (
            tripId === null ? undefined : client?.channels.subscription('trip_presence', tripId)
          )?.publish({ type: 'cursor', data });
        },
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
      publisher.set(cursorKey(mine.current.anchor, mine.current.offset));
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
        const offset = typeof data.offset === 'number' ? data.offset : 0;
        setCursors((current) => {
          const next = new Map(current);
          if (anchor === null) next.delete(uid);
          else next.set(uid, { uid, anchor, offset, at: Date.now() });
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
    setCursor: (anchor, offset = 0) => {
      mine.current = { anchor, offset };
      publisher.set(cursorKey(anchor, offset));
    },
  };
}
