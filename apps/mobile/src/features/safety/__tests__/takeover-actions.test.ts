jest.mock('expo-router', () => ({ router: { push: () => undefined } }));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NotificationResponse } from 'expo-notifications';

import {
  handleSosReply,
  resetSosRepliesForTests,
  sosReplyOf,
  type SosReplyDeps,
} from '../notification-actions';
import { takeoverTargets, type OpenSosRow } from '../sos/takeover-rule';

const ME = 'u-me';
const NOW = Date.parse('2026-10-02T10:00:00Z');
const row = (over: Partial<OpenSosRow>): OpenSosRow => ({
  id: 'sos-1',
  user_id: 'u-jordan',
  opened_at: '2026-10-02T09:58:00Z',
  responses: '{}',
  ...over,
});

describe('SOS takeover from synced rows', () => {
  it("takes over for a crewmate's fresh SOS", () => {
    expect(takeoverTargets([row({})], ME, NOW)).toEqual(['sos-1']);
  });

  it('never for your own, one you already saw or answered, or an old one', () => {
    const seen = JSON.stringify({ [ME]: { state: 'seen', at: '2026-10-02T09:59:00Z' } });
    expect(takeoverTargets([row({ user_id: ME })], ME, NOW)).toEqual([]);
    expect(takeoverTargets([row({ responses: seen })], ME, NOW)).toEqual([]);
    expect(takeoverTargets([row({ opened_at: '2026-10-02T09:00:00Z' })], ME, NOW)).toEqual([]);
    expect(takeoverTargets([row({})], null, NOW)).toEqual([]);
  });
});

function response(action: string, category = 'cp.sos'): NotificationResponse {
  return {
    actionIdentifier: action,
    notification: {
      date: 0,
      request: {
        identifier: 'n-1',
        trigger: {
          payload: { cp: { ctx: { sos_id: 'sos-1', trip_id: 'trip-1', sender_id: 'u-jordan' } } },
        },
        content: { categoryIdentifier: category, data: {} },
      },
    },
  } as unknown as NotificationResponse;
}

describe('SOS push actions', () => {
  let deps: jest.Mocked<SosReplyDeps>;
  beforeEach(() => {
    resetSosRepliesForTests();
    deps = {
      respond: jest.fn<SosReplyDeps['respond']>().mockResolvedValue(undefined),
      phoneOf: jest.fn<SosReplyDeps['phoneOf']>().mockResolvedValue('+84 90 123 4567'),
      dial: jest.fn(),
      open: jest.fn(),
    };
  });

  it('reads only an SOS action on an SOS push', () => {
    expect(sosReplyOf(response('COMING'))).toMatchObject({ action: 'COMING', sosId: 'sos-1' });
    expect(sosReplyOf(response('COMING', 'cp.vote'))).toBeNull();
    expect(sosReplyOf(response('approve'))).toBeNull();
  });

  it('COMING answers once, however often the reply is seen, and opens the SOS', async () => {
    await handleSosReply(sosReplyOf(response('COMING')), deps);
    await handleSosReply(sosReplyOf(response('COMING')), deps);
    expect(deps.respond.mock.calls).toEqual([[{ sos_id: 'sos-1', state: 'coming' }]]);
    expect(deps.open.mock.calls).toEqual([['sos-1']]);
  });

  it('CALL dials a visible number and opens the SOS when there is none', async () => {
    await handleSosReply(sosReplyOf(response('CALL')), deps);
    expect(deps.dial).toHaveBeenCalledWith('+84 90 123 4567');
    expect(deps.open).not.toHaveBeenCalled();
    resetSosRepliesForTests();
    deps.phoneOf.mockResolvedValue(null);
    await handleSosReply(sosReplyOf(response('CALL')), deps);
    expect(deps.open).toHaveBeenCalledWith('sos-1');
    expect(deps.respond).not.toHaveBeenCalled();
  });
});
