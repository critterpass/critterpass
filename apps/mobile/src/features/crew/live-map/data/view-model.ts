/**
 * Everything the crew live map draws, derived in one pure pass from the synced crew, the live
 * state, the device's own fix and the clock: one entry per crewmate (sharing, paused or off),
 * the pins (members within 60 m and 2 minutes bunch into one pill), and the header counts.
 */
import { bunch, STALE_FIX_MS, type MeetupWire, type MemberEtaWire } from '@cp/domain';

import type { LiveMember, LiveState } from './live-state';
import type { OwnFix } from './services';
import type { CrewMate, TripCrew } from './use-trip-crew';

/** Accuracy beyond this reads as "Approximate" (precise location off): a 1 km circle. */
export const APPROXIMATE_ACC_M = 500;

export type Sharing = 'live' | 'paused' | 'off';

export interface PersonView {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly isMe: boolean;
  readonly sharing: Sharing;
  /** Epoch ms the share was paused, for "Paused sharing at 14:00". */
  readonly pausedAt: number | null;
  readonly position: LiveMember | null;
  readonly stale: boolean;
  readonly approximate: boolean;
  readonly eta: MemberEtaWire | null;
  readonly phone: string | null;
}

export type PinView =
  | { readonly kind: 'single'; readonly person: PersonView }
  | {
      readonly kind: 'bunch';
      readonly people: readonly PersonView[];
      readonly lat: number;
      readonly lng: number;
    };

export interface LiveView {
  readonly people: readonly PersonView[];
  readonly pins: readonly PinView[];
  readonly me: PersonView | null;
  readonly sharingCount: number;
  readonly memberCount: number;
  readonly meetup: MeetupWire | null;
  readonly allArrived: boolean;
  readonly allClose: boolean;
}

function personOf(
  mate: CrewMate,
  state: LiveState,
  me: string | null,
  ownFix: OwnFix | null,
  mySharing: Sharing,
  now: number,
): PersonView {
  const isMe = mate.uid === me;
  const share = state.shares.get(mate.uid);
  const sharing: Sharing = isMe
    ? mySharing
    : share === undefined
      ? 'off'
      : share.paused
        ? 'paused'
        : 'live';
  let position = sharing === 'live' ? (state.members.get(mate.uid) ?? null) : null;
  if (isMe && ownFix !== null) {
    position = { uid: mate.uid, ...ownFix, activity: position?.activity ?? 'unknown' };
  }
  return {
    uid: mate.uid,
    name: mate.name,
    joinIndex: mate.joinIndex,
    isMe,
    sharing,
    pausedAt: sharing === 'paused' && share !== undefined ? Date.parse(share.changed_at) : null,
    position,
    stale: position !== null && now - position.at > STALE_FIX_MS,
    approximate: position !== null && position.acc > APPROXIMATE_ACC_M,
    eta: sharing === 'off' ? null : (state.etas.get(mate.uid) ?? null),
    phone: mate.phone,
  };
}

export function buildLiveView(input: {
  readonly crew: TripCrew;
  readonly state: LiveState;
  readonly me: string | null;
  readonly ownFix: OwnFix | null;
  readonly now: number;
}): LiveView {
  const { crew, state, me, ownFix, now } = input;
  const mine = crew.myShare;
  const liveMine = me === null ? undefined : state.shares.get(me);
  const mySharing: Sharing =
    liveMine !== undefined
      ? liveMine.paused
        ? 'paused'
        : 'live'
      : mine === null
        ? 'off'
        : mine.paused
          ? 'paused'
          : 'live';
  const people = crew.members.map((mate) => personOf(mate, state, me, ownFix, mySharing, now));
  const others = people.filter((person) => !person.isMe && person.position !== null);
  const bunches = bunch(
    others.map((person) => ({
      person,
      uid: person.uid,
      lat: (person.position as LiveMember).lat,
      lng: (person.position as LiveMember).lng,
      at: (person.position as LiveMember).at,
    })),
  );
  const pins: PinView[] = bunches.map((group) =>
    group.members.length === 1 && group.members[0] !== undefined
      ? { kind: 'single', person: group.members[0].person }
      : {
          kind: 'bunch',
          people: group.members.map((m) => m.person),
          lat: group.lat,
          lng: group.lng,
        },
  );
  const meetup = state.meetup ?? crew.meetup;
  const sharingPeople = people.filter((person) => person.sharing === 'live');
  // Counted: sharing members the ETA recount has a position for.
  const counted = sharingPeople.filter((person) => person.eta !== null);
  const allArrived =
    meetup !== null &&
    counted.length > 0 &&
    counted.every((person) => person.eta?.arrived === true);
  return {
    people,
    pins,
    me: people.find((person) => person.isMe) ?? null,
    sharingCount: sharingPeople.length,
    memberCount: people.length,
    meetup,
    allArrived,
    allClose: state.allClose,
  };
}
