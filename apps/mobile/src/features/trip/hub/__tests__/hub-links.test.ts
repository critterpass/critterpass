import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { registerScreens } from '@/lib/navigation/screen-registry';

import { activityHref, planningLink, voteHref } from '../hub-links';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  // The vote area registers these at load; the paths are its own.
  registerScreens({
    '3c-1': (params) => ({
      pathname: '/vote/[pollId]',
      params: { pollId: params['pollId'] ?? '' },
    }),
    '3c-2': (params) => ({
      pathname: '/vote/[pollId]/reveal',
      params: { pollId: params['pollId'] ?? '' },
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

  it('sends ticker lines about a vote to it, and a closed vote to its reveal', () => {
    const at = (verb: string, kind: string) =>
      activityHref({ verb, object_kind: kind, object_id: 'p-1' }, 't-1');
    expect(at('asked', 'poll')).toBe('/');
    expect(at('pitched', 'poll_option')).toBe('/');
    expect(at('decided', 'poll')).toEqual({
      pathname: '/vote/[pollId]/reveal',
      params: { pollId: 'p-1' },
    });
    expect(activityHref({ verb: 'joined', object_kind: 'poll', object_id: null }, 't-1')).toBe(
      undefined,
    );
  });
});
