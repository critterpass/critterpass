/**
 * The crew live map's in-memory state, folded from the live snapshot and the `trip_locations`
 * publications. Positions live only here, for as long as the screen is open: nothing is persisted.
 * A paused or ended share drops that member's position at once.
 */
import type {
  LiveFixWire,
  LiveMapMessage,
  LiveShareWire,
  LiveSnapshot,
  MeetupWire,
  MemberEtaWire,
} from '@cp/domain';

export interface LiveMember {
  readonly uid: string;
  readonly lat: number;
  readonly lng: number;
  readonly acc: number;
  readonly activity: LiveFixWire['activity'];
  /** Epoch ms of the fix. */
  readonly at: number;
}

export interface LivePing {
  readonly by: string;
  readonly kind: 'ping' | 'on_my_way';
  readonly etaMin: number | null;
  /** Epoch ms it arrived. */
  readonly at: number;
}

export interface LiveState {
  readonly members: ReadonlyMap<string, LiveMember>;
  readonly shares: ReadonlyMap<string, LiveShareWire>;
  readonly etas: ReadonlyMap<string, MemberEtaWire>;
  readonly meetup: MeetupWire | null;
  readonly allClose: boolean;
  readonly windowEndsAt: number | null;
  /** Epoch ms of the last snapshot or publication. */
  readonly updatedAt: number | null;
  readonly lastPing: LivePing | null;
}

export const EMPTY_LIVE_STATE: LiveState = {
  members: new Map(),
  shares: new Map(),
  etas: new Map(),
  meetup: null,
  allClose: false,
  windowEndsAt: null,
  updatedAt: null,
  lastPing: null,
};

function memberOf(fix: LiveFixWire): LiveMember {
  return {
    uid: fix.uid,
    lat: fix.lat,
    lng: fix.lng,
    acc: fix.acc,
    activity: fix.activity,
    at: Date.parse(fix.at),
  };
}

function without<V>(map: ReadonlyMap<string, V>, key: string): Map<string, V> {
  const next = new Map(map);
  next.delete(key);
  return next;
}

export function fromSnapshot(snapshot: LiveSnapshot, now: number): LiveState {
  const etas = new Map(snapshot.etas.map((eta) => [eta.uid, eta]));
  return {
    members: new Map(snapshot.members.map((fix) => [fix.uid, memberOf(fix)])),
    shares: new Map(snapshot.shares.map((share) => [share.uid, share])),
    etas,
    meetup: snapshot.meetup,
    allClose:
      snapshot.etas.length > 0 &&
      snapshot.etas.every((eta) => eta.arrived || (eta.min ?? Infinity) < 5),
    windowEndsAt: snapshot.window_ends_at === null ? null : Date.parse(snapshot.window_ends_at),
    updatedAt: now,
    lastPing: null,
  };
}

/** Applies one publication; unknown members' fixes are kept (their share row may lag). */
export function applyLiveMessage(
  state: LiveState,
  message: LiveMapMessage,
  now: number,
): LiveState {
  switch (message.type) {
    case 'fixes': {
      const members = new Map(state.members);
      for (const fix of message.data.fixes) {
        if (state.shares.get(fix.uid)?.paused === true) continue;
        const current = members.get(fix.uid);
        const next = memberOf(fix);
        if (current === undefined || next.at >= current.at) members.set(fix.uid, next);
      }
      return { ...state, members, updatedAt: now };
    }
    case 'eta':
      if (state.meetup !== null && message.data.meetup_id !== state.meetup.id) return state;
      return {
        ...state,
        etas: new Map(message.data.etas.map((eta) => [eta.uid, eta])),
        allClose: message.data.all_close,
        updatedAt: now,
      };
    case 'meetup.created':
    case 'meetup.moved':
      return {
        ...state,
        meetup: message.data.meetup,
        etas: message.type === 'meetup.moved' ? new Map() : state.etas,
        allClose: false,
        updatedAt: now,
      };
    case 'ping':
      return {
        ...state,
        lastPing: {
          by: message.data.by,
          kind: message.data.kind,
          etaMin: message.data.eta_min,
          at: now,
        },
      };
    case 'share.started':
      return {
        ...state,
        shares: new Map(state.shares).set(message.data.uid, {
          uid: message.data.uid,
          share_id: message.data.share_id,
          paused: false,
          changed_at: new Date(now).toISOString(),
        }),
        updatedAt: now,
      };
    case 'share.paused':
      return {
        ...state,
        members: without(state.members, message.data.uid),
        shares: new Map(state.shares).set(message.data.uid, {
          uid: message.data.uid,
          share_id: message.data.share_id,
          paused: true,
          changed_at: message.data.at,
        }),
        updatedAt: now,
      };
    case 'share.resumed':
      return {
        ...state,
        shares: new Map(state.shares).set(message.data.uid, {
          uid: message.data.uid,
          share_id: message.data.share_id,
          paused: false,
          changed_at: new Date(now).toISOString(),
        }),
        updatedAt: now,
      };
    case 'share.ended':
      return {
        ...state,
        members: without(state.members, message.data.uid),
        shares: without(state.shares, message.data.uid),
        etas: without(state.etas, message.data.uid),
        updatedAt: now,
      };
  }
}
