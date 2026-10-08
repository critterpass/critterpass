import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { registerScreens } from '@/lib/navigation/screen-registry';

import { activityHref, planningLink, voteHref } from '../hub-links';
import { disruptionHref } from '../hub-disruptions';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  // The vote area registers these at load; the paths are its own.
  registerScreens({
    '3c-1': (params) => ({
      pathname: '/vote/[pollId]',
      params: { pollId: params['pollId'] ?? '' },
    }),
    'plan-hub': (params) => ({
      pathname: '/[tripId]/plan',
      params: { tripId: params['tripId'] ?? '' },
    }),
  });
});

const SHOWDOWN = { pathname: '/vote/[pollId]', params: { pollId: 'p-1' } };

describe('hub links', () => {
  it('opens Home for a vote still on its board, and the showdown once it is down to two', () => {
    expect(voteHref({ id: 'p-1', stage: 'board' })).toBe('/');
    expect(voteHref({ id: 'p-1', stage: null })).toBe('/');
    expect(voteHref({ id: 'p-1', stage: 'final' })).toEqual(SHOWDOWN);
  });

  it('labels the voting CTA and sends it where the vote is drawn', () => {
    const link = planningLink('t-1', 'voting', { id: 'p-1', stage: 'board' });
    expect(link).toEqual({ label: 'Voting', href: '/' });
  });

  it('never offers the plan while the trip still votes, even before its poll is on the phone', () => {
    expect(planningLink('t-1', 'voting', undefined)).toEqual({ label: 'Voting', href: '/' });
  });

  it('opens set-up at the step the trip is on', () => {
    const SETUP = { pathname: '/[tripId]/setup', params: { tripId: 't-1' } };
    expect(planningLink('t-1', 'won', undefined).href).toEqual(SETUP);
    expect(planningLink('t-1', 'setup', undefined).href).toEqual(SETUP);
  });

  it('opens each open disruption on its own screen, and the forecast for the rest', () => {
    const at = (kind: string, poll: string | null = null) =>
      disruptionHref({ id: 'd-1', kind, decision_poll_id: poll }, 't-1');
    const FORECAST = { pathname: '/(trip)/forecast/[tripId]', params: { tripId: 't-1' } };
    expect(at('flight_delay')).toEqual({
      pathname: '/(trip)/disruption/[id]',
      params: { id: 'd-1' },
    });
    expect(at('running_late')).toEqual({ pathname: '/(trip)/late/[id]', params: { id: 'd-1' } });
    expect(at('storm', 'p-9')).toEqual({
      pathname: '/(trip)/storm/[pollId]',
      params: { pollId: 'p-9' },
    });
    expect(at('storm')).toEqual(FORECAST);
    expect(at('closure')).toEqual(FORECAST);
  });

  it('sends ticker lines about a vote to it, and a decided vote to what it decided', () => {
    const at = (verb: string, kind: string, status: string | null = null) =>
      activityHref({ verb, object_kind: kind, object_id: 'p-1' }, 't-1', status);
    expect(at('asked', 'poll')).toBe('/');
    expect(at('pitched', 'poll_option')).toBe('/');
    expect(at('decided', 'poll', 'setup')).toEqual({
      pathname: '/[tripId]/setup',
      params: { tripId: 't-1' },
    });
    expect(at('decided', 'poll', 'pre_trip')).toEqual({
      pathname: '/[tripId]/plan',
      params: { tripId: 't-1' },
    });
    expect(activityHref({ verb: 'joined', object_kind: 'poll', object_id: null }, 't-1')).toBe(
      undefined,
    );
  });
});
