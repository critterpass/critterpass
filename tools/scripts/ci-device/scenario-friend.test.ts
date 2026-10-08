import { describe, expect, it } from 'vitest';

import {
  firstOption,
  isFriendAction,
  openPoll,
  proposalTrip,
  sentProposal,
  sessionFile,
} from './scenario-friend';

describe('the simulated friend', () => {
  it('knows its actions and keeps one session file per crew code', () => {
    expect(isFriendAction('drop-out')).toBe(true);
    expect(isFriendAction('leave')).toBe(false);
    expect(isFriendAction(undefined)).toBe(false);
    expect(sessionFile('k7m2qx', '/tmp/run')).toBe('/tmp/run/cp-scenario-friend-K7M2QX.json');
  });

  it('answers the proposal that is out: on the trip waiting for replies, sent and not replaced', () => {
    const trips = [
      { id: 'old', status: 'post_trip', created_at: '2026-09-01T00:00:00Z' },
      { id: 'asked', status: 'proposed', created_at: '2026-10-01T00:00:00Z' },
      { id: 'newer', status: 'setup', created_at: '2026-10-05T00:00:00Z' },
    ];
    expect(proposalTrip(trips)?.id).toBe('asked');
    expect(proposalTrip([trips[0]!, trips[2]!])?.id).toBe('newer');
    expect(proposalTrip([])).toBeUndefined();

    const proposals = [
      { id: 'unsent', status: 'building', sent_at: null },
      { id: 'first', status: 'superseded', sent_at: '2026-10-02T08:00:00Z' },
      { id: 'second', status: 'sent', sent_at: '2026-10-02T09:00:00Z' },
    ];
    expect(sentProposal(proposals)?.id).toBe('second');
    expect(sentProposal([proposals[0]!, proposals[1]!])).toBeUndefined();
  });

  it('votes in the newest open poll, for its first option still standing', () => {
    const polls = [
      { id: 'closed', status: 'closed', created_at: '2026-10-03T00:00:00Z' },
      { id: 'open-old', status: 'open', created_at: '2026-10-01T00:00:00Z' },
      { id: 'open-new', status: 'open', created_at: '2026-10-02T00:00:00Z' },
    ];
    expect(openPoll(polls)?.id).toBe('open-new');
    expect(openPoll([polls[0]!])).toBeUndefined();

    const options = [
      { id: 'other-poll', poll_id: 'open-old', position: 0, eliminated_at: null },
      { id: 'out', poll_id: 'open-new', position: 0, eliminated_at: '2026-10-02T01:00:00Z' },
      { id: 'third', poll_id: 'open-new', position: 2, eliminated_at: null },
      { id: 'second', poll_id: 'open-new', position: 1, eliminated_at: null },
    ];
    expect(firstOption(options, 'open-new')?.id).toBe('second');
    expect(firstOption(options, 'closed')).toBeUndefined();
  });
});
