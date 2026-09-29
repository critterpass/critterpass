/**
 * The crew meet-up at a glance, for the lock-screen Live Activity and the widgets: the place and
 * time, who is sharing, each person's ETA and arrival, and whether everyone is close. Built from
 * the same state the map draws, so the Live Activity never disagrees with the screen.
 */
import { useMemo } from 'react';

import type { LiveView } from './view-model';

export interface MeetupSnapshot {
  readonly meetupId: string;
  readonly place: string;
  /** ISO instant. */
  readonly meetAt: string;
  readonly allClose: boolean;
  readonly members: readonly {
    readonly uid: string;
    readonly name: string;
    readonly joinIndex: number;
    readonly etaMin: number | null;
    readonly estimate: boolean;
    readonly arrived: boolean;
    readonly paused: boolean;
  }[];
}

export function meetupSnapshotOf(view: LiveView): MeetupSnapshot | null {
  const meetup = view.meetup;
  if (meetup === null) return null;
  return {
    meetupId: meetup.id,
    place: meetup.place_name,
    meetAt: meetup.meet_at,
    allClose: view.allClose,
    members: view.people
      .filter((person) => person.sharing !== 'off')
      .map((person) => ({
        uid: person.uid,
        name: person.name,
        joinIndex: person.joinIndex,
        etaMin: person.eta?.min ?? null,
        estimate: person.eta?.estimate ?? false,
        arrived: person.eta?.arrived ?? false,
        paused: person.sharing === 'paused',
      })),
  };
}

export function useMeetupSnapshot(view: LiveView): MeetupSnapshot | null {
  return useMemo(() => meetupSnapshotOf(view), [view]);
}
