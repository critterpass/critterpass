/**
 * Android surface payloads: the initiator rule (Live Updates only on the device of the member who
 * started or opted into a session, notifications for everyone else) and the FCM data shape.
 */
import { MAX_FCM_DATA_BYTES, jsonBytes, type LaKind } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  androidSurfaceFor,
  boostOfferSurface,
  laSurfaceMessages,
  widgetRefreshFcmData,
  type LaSurfaceInput,
  type SurfaceDevice,
} from '../../src/push/fcm-surfaces';

const now = new Date('2026-10-06T06:00:00Z');
const nowSec = Math.floor(now.getTime() / 1000);
const MEETUP = '0192f3c4-0000-7000-8000-0000000000a1';

const device = (id: string, patch: Partial<SurfaceDevice> = {}): SurfaceDevice => ({
  deviceId: id,
  token: `fcm-${id}`,
  initiator: false,
  optedIn: false,
  ...patch,
});

const meetUp: LaSurfaceInput = {
  kind: 'meet_up',
  op: 'start',
  refId: MEETUP,
  contentState: {
    seq: 1,
    state: 'gathering',
    eta_min: 9,
    all_under_5: false,
    members: [{ uid_hash: 'aaaaaaaa', initial: 'A', tone: 0, step: 4, min: 9, arrived: false }],
    stragglers: [],
    end_reason: null,
  },
  attributes: {
    trip_id: '0192f3c4-0000-7000-8000-0000000000b1',
    meetup_id: MEETUP,
    place_name: 'Dragon Bridge',
    meet_at: nowSec + 900,
  },
  includeAttributes: true,
  now,
};

describe('android surface audience', () => {
  it('gives the meet-up starter and ON MY WAY members a Live Update and the rest a heads-up', () => {
    const messages = laSurfaceMessages(meetUp, [
      device('starter', { initiator: true }),
      device('on-my-way', { optedIn: true }),
      device('crewmate'),
    ]);
    expect(messages.map((m) => [m.deviceId, m.surface])).toEqual([
      ['starter', 'live_update'],
      ['on-my-way', 'live_update'],
      ['crewmate', 'high_priority'],
    ]);
    const [live] = messages;
    expect(live?.data).toMatchObject({
      type: 'la.meet_up',
      op: 'start',
      ref_id: MEETUP,
      surface: 'live_update',
      channel_id: 'cp_trip',
    });
    expect(JSON.parse(live?.data['spec'] ?? '{}')).toMatchObject({ progress: 6, chip: { min: 9 } });
    expect(JSON.parse(live?.data['attributes'] ?? '{}')).toMatchObject({
      place_name: 'Dragon Bridge',
    });
    expect(live?.priority).toBe('high');
    expect(live?.collapseKey).toBe(`la:meet_up:${MEETUP}`);
  });

  it.each<[LaKind, string]>([
    ['leave_by', 'none'],
    ['flight', 'high_priority'],
    ['critter_nearby', 'standard'],
    ['sos', 'high_priority'],
  ])('sends %s to members who did not start it as %s', (kind, surface) => {
    expect(androidSurfaceFor(kind, { initiator: false, optedIn: false })).toBe(surface);
    expect(androidSurfaceFor(kind, { initiator: true, optedIn: false })).toBe('live_update');
  });

  it('never makes a vote or a storm a Live Update, even for whoever started it', () => {
    for (const kind of ['vote', 'storm'] as const) {
      expect(androidSurfaceFor(kind, { initiator: true, optedIn: true })).toBe('high_priority');
    }
  });

  it('leaves members who share no leave-by out entirely', () => {
    const input: LaSurfaceInput = { ...meetUp, kind: 'leave_by' };
    expect(laSurfaceMessages(input, [device('other')])).toEqual([]);
  });

  it('offers the Boost lock-screen session to everyone and runs it for those who opt in', () => {
    expect(boostOfferSurface({ initiator: false, optedIn: false })).toBe('opt_in_offer');
    expect(boostOfferSurface({ initiator: false, optedIn: true })).toBe('live_update');
  });

  it('sends the SOS to other members on the DND channel without a spec they cannot draw', () => {
    const [message] = laSurfaceMessages(
      {
        kind: 'sos',
        op: 'update',
        refId: '0192f3c4-0000-7000-8000-0000000000c1',
        contentState: { seq: 2, state: 'responding', responders: 1, last_seen_min: 3 },
        attributes: { sos_id: '0192f3c4-0000-7000-8000-0000000000c1', sender_name: 'Linh' },
        includeAttributes: false,
        now,
      },
      [device('crewmate')],
    );
    expect(message?.data['channel_id']).toBe('cp_sos');
    expect(message?.data['surface']).toBe('high_priority');
    expect(message?.data['attributes']).toBeUndefined();
    expect(jsonBytes(message?.data)).toBeLessThanOrEqual(MAX_FCM_DATA_BYTES);
  });

  it('asks every widget to refresh, or only the kinds that changed', () => {
    expect(widgetRefreshFcmData()).toEqual({ type: 'widget.refresh' });
    expect(widgetRefreshFcmData(['vote', 'balances'])).toEqual({
      type: 'widget.refresh',
      kinds: '["vote","balances"]',
    });
  });
});
