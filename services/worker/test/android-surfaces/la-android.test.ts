/**
 * A Live Activity step on Android phones: who gets a Live Update, who a notification and who
 * nothing, and the FCM message each step becomes, sent through the real FCM client to the
 * recorded fake FCM server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { androidStartSurface, androidSurfaceOf, startersOn } from '../../src/jobs/la/android';
import { deliverOne, laFcmMessage, type LaSend } from '../../src/jobs/la/deliver';
import { createFcmProvider, type FcmProvider } from '../../src/push/fcm';
import { startFakeFcm, type FakeFcm } from '../push-servers';

const now = new Date('2026-10-06T06:00:00Z');
const nowSec = Math.floor(now.getTime() / 1000);
const MEETUP = '0192f3c4-0000-7000-8000-0000000000a1';
const [starter, onMyWay, crewmate] = ['u-starter', 'u-on-my-way', 'u-crewmate'];
const roles = { initiators: [starter], optedIn: [onMyWay] };

type FcmLaSend = Extract<LaSend, { via: 'fcm' }>;

const step = (patch: Partial<FcmLaSend> = {}): FcmLaSend => ({
  via: 'fcm',
  rowId: 'row-1',
  token: 'ok-device',
  kind: 'meet_up',
  refId: MEETUP,
  event: 'start',
  priority: 5,
  relevance: 70,
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
  surface: 'live_update',
  ...patch,
});

describe('who an object reaches on Android', () => {
  it('gives the starter and ON MY WAY members a Live Update, the rest a heads-up', () => {
    expect(androidSurfaceOf('meet_up', roles, starter)).toBe('live_update');
    expect(androidSurfaceOf('meet_up', roles, onMyWay)).toBe('live_update');
    expect(androidSurfaceOf('meet_up', roles, crewmate)).toBe('high_priority');
  });

  it('treats nobody as the starter when the object names none', () => {
    expect(androidSurfaceOf('flight', {}, starter)).toBe('high_priority');
    expect(androidSurfaceOf('leave_by', {}, starter)).toBe('none');
  });

  it('starts a Live Update only on a phone that can show one', () => {
    const phone = { user_id: starter, la_on: true, fcm_token: 'ok-1' };
    expect(androidStartSurface('meet_up', roles, phone)).toBe('live_update');
    expect(androidStartSurface('meet_up', roles, { ...phone, la_on: false })).toBeNull();
    expect(androidStartSurface('meet_up', roles, { ...phone, fcm_token: null })).toBeNull();
  });

  it('notifies the others whatever their Live Update setting', () => {
    const phone = { user_id: crewmate, la_on: false, fcm_token: 'ok-2' };
    expect(androidStartSurface('meet_up', roles, phone)).toBe('high_priority');
    expect(androidStartSurface('sos', roles, phone)).toBe('high_priority');
  });

  it('sends a member without their own alarm nothing for a leave-by', () => {
    const phone = { user_id: crewmate, la_on: true, fcm_token: 'ok-3' };
    expect(androidStartSurface('leave_by', roles, phone)).toBeNull();
    expect(androidStartSurface('leave_by', { initiators: [crewmate] }, phone)).toBe('live_update');
  });

  it('starts an SOS for its sender on Android, where the phone does not start its own', () => {
    const sos = { audience: [starter, crewmate], startAudience: [crewmate] };
    expect([...startersOn('ios', sos)]).toEqual([crewmate]);
    expect([...startersOn('android', sos)]).toEqual([crewmate]);
    expect([...startersOn('android', { ...sos, androidStartAudience: sos.audience })]).toEqual([
      starter,
      crewmate,
    ]);
    expect([...startersOn('ios', { audience: [starter] })]).toEqual([starter]);
  });
});

describe('the FCM message of one step', () => {
  it('carries the surface, channel, spec and attributes on start', () => {
    const message = laFcmMessage(step(), now);
    expect(message).toMatchObject({
      token: 'ok-device',
      priority: 'high',
      ttlSeconds: 3600,
      collapseKey: `la:meet_up:${MEETUP}`,
    });
    expect(message?.data).toMatchObject({
      type: 'la.meet_up',
      op: 'start',
      ref_id: MEETUP,
      surface: 'live_update',
      channel_id: 'cp_trip',
    });
    expect(JSON.parse(message?.data['spec'] ?? '{}')).toMatchObject({ chip: { min: 9 } });
    expect(JSON.parse(message?.data['attributes'] ?? '{}')).toMatchObject({
      place_name: 'Dragon Bridge',
    });
  });

  it('draws an update from the attributes without sending them again', () => {
    const message = laFcmMessage(step({ event: 'update' }), now);
    expect(message?.data['op']).toBe('update');
    expect(message?.data['attributes']).toBeUndefined();
    expect(JSON.parse(message?.data['spec'] ?? '{}')).toMatchObject({ chip: { min: 9 } });
  });

  it('sends a quiet notification at normal priority', () => {
    const message = laFcmMessage(
      step({
        kind: 'critter_nearby',
        surface: 'standard',
        contentState: { seq: 1, state: 'dwelling', distance_band: 'near', dwell_fraction: 0.4 },
        attributes: { spawn_id: MEETUP, place_name: 'Han Market' },
      }),
      now,
    );
    expect(message?.priority).toBe('normal');
    expect(message?.data).toMatchObject({ surface: 'standard', channel_id: 'cp_critters' });
  });

  it('ends an activity planned without its object with the bare frame', () => {
    const { surface: _surface, attributes: _attributes, ...bare } = step({ event: 'end' });
    const message = laFcmMessage(bare, now);
    expect(message?.data).toMatchObject({ type: 'la.meet_up', op: 'end', ref_id: MEETUP });
    expect(message?.data['surface']).toBeUndefined();
    expect(message?.data['spec']).toBeUndefined();
  });

  it('refuses a step too large for a data message', () => {
    const huge = step({ event: 'update', contentState: { seq: 1, note: 'x'.repeat(5000) } });
    expect(laFcmMessage(huge, now)).toBeNull();
  });
});

describe('delivering a step over FCM', () => {
  let server: FakeFcm;
  let fcm: FcmProvider;

  beforeAll(async () => {
    server = await startFakeFcm();
    fcm = createFcmProvider({
      serviceAccount: server.serviceAccount,
      httpAgent: server.agent,
      credential: server.credential,
    });
  });

  afterAll(async () => {
    await fcm.shutdown();
    await server.close();
  });

  it('posts a data-only message the phone can parse', async () => {
    const outcome = await deliverOne({ fcm }, new Map(), step());
    expect(outcome.result.outcome).toBe('sent');
    const message = server.requests.at(-1)?.body.message as {
      token: string;
      data: Record<string, string>;
      notification?: unknown;
    };
    expect(message.token).toBe('ok-device');
    expect(message.notification).toBeUndefined();
    expect(message.data).toMatchObject({
      type: 'la.meet_up',
      op: 'start',
      surface: 'live_update',
      channel_id: 'cp_trip',
    });
  });

  it('reports a token FCM retired', async () => {
    const outcome = await deliverOne({ fcm }, new Map(), step({ token: 'gone-device' }));
    expect(outcome.result.outcome).toBe('invalid_token');
  });

  it('never sends a step that cannot fit', async () => {
    const before = server.requests.length;
    const huge = step({ event: 'update', contentState: { seq: 1, note: 'x'.repeat(5000) } });
    const outcome = await deliverOne({ fcm }, new Map(), huge);
    expect(outcome.result).toEqual({ outcome: 'rejected', reason: 'payload_too_large' });
    expect(server.requests.length).toBe(before);
  });
});
