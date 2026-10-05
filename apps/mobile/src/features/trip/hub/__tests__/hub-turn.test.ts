/**
 * The hub before a plan is sent: a member is told the plan is coming and is given nothing that
 * opens an empty plan; the organiser's PLAN tile is her private draft; a vote keeps its own link.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import type { TripTurnView } from '@/features/home';

import { statusLine } from '../hub-copy';
import { hubPlanning, planTileBeforeSend } from '../hub-turn';

const view = (over: Partial<TripTurnView>): TripTurnView => ({
  kind: 'plan_coming',
  mine: false,
  line: 'Linh is still working on the plan.',
  button: null,
  organiser: 'Linh',
  crewSize: 2,
  href: undefined,
  ...over,
});

describe('the hub while the crew agrees on a plan', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('gives a waiting member the line and no button', () => {
    const planning = hubPlanning(view({}), { label: 'See the plan', href: '/plan' });
    expect(planning).toEqual({ note: 'Linh is still working on the plan.' });
  });

  it('gives the organiser her step as the one button', () => {
    const turn = view({
      kind: 'send_plan',
      mine: true,
      line: 'Your draft is ready.',
      button: 'Send the plan',
      href: '/draft',
    });
    expect(hubPlanning(turn, null)).toEqual({
      note: 'Your draft is ready.',
      label: 'Send the plan',
      href: '/draft',
    });
  });

  it('keeps the vote link while the place is being chosen, and before the turn is known', () => {
    const vote = { label: 'Voting', href: '/' as const };
    expect(hubPlanning(view({ kind: 'vote' }), vote)).toEqual(vote);
    expect(hubPlanning(null, vote)).toEqual(vote);
  });

  it('never opens the empty plan for a member before the plan is sent', () => {
    expect(planTileBeforeSend(view({}), '/draft')?.href).toBeUndefined();
  });

  it('opens the organiser’s draft from her PLAN tile, and steps aside once the plan is out', () => {
    expect(planTileBeforeSend(view({ kind: 'finish_draft' }), '/draft')?.href).toBe('/draft');
    const answering = view({ kind: 'answer' });
    expect(planTileBeforeSend(answering, '/draft')).toBeNull();
  });

  it('tells only the organiser that a draft exists', () => {
    expect(statusLine('draft_review', true)).not.toBe(statusLine('draft_review', false));
    expect(statusLine('proposed', true)).toBe(statusLine('proposed', false));
  });
});
