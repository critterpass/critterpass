/**
 * The vote poster's first frame: each answer's critter and colour (a destination wears its city's
 * guide, others the trip's guide in turn), the counts, the turnout and the closing time.
 */
import type { PollState } from '@cp/db';
import { describe, expect, it } from 'vitest';

import { votePosterContext } from '../../src/jobs/polls/poster';

const id = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const guide = { kind: 'guide' as const, id: 'tokek', name: 'Tokek' };

function poll(over: Partial<PollState['poll']> = {}): PollState {
  const option = (n: number, label: string, kind = 'destination') => ({
    id: id(n),
    kind,
    ref_id: id(n + 100),
    label,
    frozen_quote_id: null,
    pitch_id: null,
    proposed_by: null,
    position: n,
    eliminated_at: null,
  });
  const ballot = (option: number, user: number) => ({
    option_id: id(option),
    user_id: id(user),
    source: 'app',
    cast_at: new Date('2026-10-10T10:00:00Z'),
  });
  return {
    poll: {
      id: id(1),
      crew_id: id(2),
      trip_id: id(3),
      kind: 'destination',
      stage: 'final',
      status: 'open',
      question: null,
      created_by: id(20),
      eligible_voter_ids: [20, 21, 22, 23, 24, 25].map(id),
      decider_policy: null,
      threshold: null,
      closes_at: new Date('2026-10-16T18:00:00Z'),
      allow_change: true,
      tie_rule: 'earliest_to_count',
      winner_option_id: null,
      result: null,
      closed_at: null,
      version: 1,
      ...over,
    },
    options: [option(10, 'Kyoto'), option(11, 'Lisbon')],
    ballots: [ballot(10, 20), ballot(10, 21), ballot(11, 22)],
  };
}

describe('vote poster context', () => {
  it('dresses destinations in their city guide and counts the turnout', () => {
    const ctx = votePosterContext(
      poll(),
      guide,
      new Map([
        [id(10), { slug: 'pon', colour: 'orange' }],
        [id(11), { slug: 'sardi', colour: 'green' }],
      ]),
    );
    expect(ctx['options']).toEqual([
      { id: id(10), label: 'Kyoto', critter: 'pon', tone: 'orange', count: 2 },
      { id: id(11), label: 'Lisbon', critter: 'sardi', tone: 'green', count: 1 },
    ]);
    expect(ctx).toMatchObject({ voted: 3, eligible: 6, closes_at: 1_792_173_600 });
  });

  it('gives other answers the trip guide with colours in turn, and no close time when open-ended', () => {
    const ctx = votePosterContext(poll({ closes_at: null }), guide, new Map());
    expect(ctx['options']).toMatchObject([
      { critter: 'tokek', tone: 'orange' },
      { critter: 'tokek', tone: 'green' },
    ]);
    expect(ctx['closes_at']).toBeNull();
  });

  it('falls back to the turn colour when a guide colour is not a crew colour', () => {
    const ctx = votePosterContext(
      poll(),
      guide,
      new Map([[id(10), { slug: 'chava', colour: 'red' }]]),
    );
    expect(ctx['options']).toMatchObject([
      { critter: 'chava', tone: 'orange' },
      { critter: 'tokek' },
    ]);
  });
});
