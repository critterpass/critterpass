import type { OurDriver } from '@cp/domain';

import { ourDriverState } from '../timeline';

const now = new Date('2026-10-25T00:00:00Z');
const base: OurDriver = {
  provider_id: 'p1',
  name: 'Made',
  day_numbers: [3, 7],
  crew_loved: 6,
  crew_voters: 6,
  my_verdict: 'loved',
  listing_id: null,
  listing_status: null,
  invite: null,
};
const invite = {
  id: 'i1',
  status: 'opened' as const,
  sent_at: '2026-10-20T00:00:00Z',
  opened_at: '2026-10-21T00:00:00Z',
  expires_at: '2026-11-20T00:00:00Z',
  nudged_at: null,
};

describe('ourDriverState', () => {
  it('shows the waiting timeline with one nudge until it is used', () => {
    expect(ourDriverState({ ...base, invite }, now)).toMatchObject({
      kind: 'waiting',
      openedAt: invite.opened_at,
      canNudge: true,
    });
    expect(
      ourDriverState({ ...base, invite: { ...invite, nudged_at: '2026-10-22T00:00:00Z' } }, now),
    ).toMatchObject({ kind: 'waiting', canNudge: false });
  });

  it('ends the invite when it expired, even before the hourly sweep', () => {
    const late = new Date('2026-11-21T00:00:00Z');
    expect(ourDriverState({ ...base, invite }, late)).toEqual({ kind: 'ended', reason: 'expired' });
    expect(ourDriverState({ ...base, invite: { ...invite, status: 'cancelled' } }, now)).toEqual({
      kind: 'ended',
      reason: 'cancelled',
    });
  });

  it('shows listed once he confirmed, and offers the card before any invite', () => {
    expect(ourDriverState({ ...base, listing_status: 'paused', listing_id: 'l1' }, now)).toEqual({
      kind: 'listed',
      paused: true,
    });
    expect(ourDriverState({ ...base, my_verdict: null }, now)).toEqual({
      kind: 'not_invited',
      rated: false,
    });
  });
});
