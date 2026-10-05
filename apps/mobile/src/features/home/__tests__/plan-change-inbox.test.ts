/**
 * A plan change in the inbox says what it is and what was decided, in words: the place, the day
 * and the time, never a bare score.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { toInboxItem, type InboxRow } from '../inbox/inbox-data';
import { PLAN_CHANGE_RENDERERS } from '../inbox/plan-change-renderers';

const NOW = new Date('2026-10-20T03:00:00Z');
const ctx = { i18n, now: NOW };

const item = (kind: string, data: Record<string, unknown>) =>
  toInboxItem({
    id: 'i-1',
    kind,
    source: 'crew',
    actor_id: 'u-minh',
    actor_name: 'Minh Le',
    actor_join_index: 1,
    crew_id: 'c-1',
    crew_name: 'Da Nang gang',
    data: JSON.stringify(data),
    needs_you: kind === 'plan_change.vote_needed' ? 1 : 0,
    actions: '[]',
    deep_link: null,
    expires_at: null,
    undo_until: null,
    resolved_at: null,
    read_at: null,
    created_at: '2026-10-20T02:59:00Z',
  } satisfies InboxRow);

const line = (kind: string, data: Record<string, unknown>): string => {
  const renderer = PLAN_CHANGE_RENDERERS.find(([k]) => k === kind)?.[1];
  if (renderer === undefined) throw new Error(`no renderer for ${kind}`);
  return renderer.line(item(kind, data), ctx);
};

const BA_NA = { op: 'add', title: 'Bà Nà Hills', date: '2026-10-21', time: '07:00', count: 1 };

describe('a plan change in the inbox', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('names the change that waits for a yes', () => {
    expect(line('plan_change.vote_needed', BA_NA)).toBe(
      'Minh wants to add Bà Nà Hills, Wed, Oct 21, 07:00',
    );
    expect(line('plan_change.vote_needed', { ...BA_NA, count: 3 })).toBe(
      'Minh wants 3 changes to the plan',
    );
  });

  it('says what was decided and what changed', () => {
    expect(line('plan_change.applied', { ...BA_NA, outcome: 'applied' })).toBe(
      'Bà Nà Hills, Wed, Oct 21, 07:00 is in the plan',
    );
    expect(line('plan_change.kept', { ...BA_NA, outcome: 'kept' })).toBe(
      'The crew said no to Bà Nà Hills, Wed, Oct 21, 07:00. The plan stays as it was.',
    );
    expect(line('plan_change.ran_out', { ...BA_NA, outcome: 'ran_out' })).toBe(
      'The vote ran out. The plan stays as it was.',
    );
    expect(
      line('plan_change.applied', { op: 'move', title: '', count: 2, outcome: 'applied' }),
    ).toBe('The crew said yes. The plan changed.');
  });
});
