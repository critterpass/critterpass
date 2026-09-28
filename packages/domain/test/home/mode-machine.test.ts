import { describe, expect, it } from 'vitest';

import {
  deriveHomeState,
  type HomeModeInput,
  type HomeTripInput,
  type HomeVoteSlot,
} from '../../src/home';

const NOW = new Date('2026-09-29T02:00:00Z');

function trip(overrides: Partial<HomeTripInput> & Pick<HomeTripInput, 'status'>): HomeTripInput {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    startDate: '2026-10-12',
    endDate: '2026-10-19',
    tz: 'Asia/Makassar',
    destinationId: null,
    destinationName: 'Bali',
    guideId: null,
    planProgress: 80,
    countdownTargetAt: null,
    ...overrides,
  };
}

function vote(stage: HomeVoteSlot['stage']): HomeVoteSlot {
  return {
    pollId: crypto.randomUUID(),
    stage,
    candidates: [],
    votersIn: 4,
    memberCount: 6,
    closesAt: null,
  };
}

function input(overrides: Partial<HomeModeInput>): HomeModeInput {
  return { hasCrew: true, trips: [], vote: null, now: NOW, ...overrides };
}

describe('deriveHomeState', () => {
  it.each<[string, HomeModeInput, string]>([
    ['no crew and no trip', input({ hasCrew: false }), 'first_run'],
    ['a crew with nothing planned', input({}), 'no_trip'],
    ['an upcoming trip', input({ trips: [trip({ status: 'confirmed' })] }), 'everyday'],
    ['an open poll at the board stage', input({ vote: vote('board') }), 'everyday'],
    ['a poll at its final stage', input({ vote: vote('final') }), 'final_vote'],
    ['a trip under way', input({ trips: [trip({ status: 'in_trip' })] }), 'in_trip'],
    [
      'a trip that ended three days ago',
      input({ trips: [trip({ status: 'post_trip', endDate: '2026-09-26' })] }),
      'post_trip',
    ],
    [
      'a trip that ended three weeks ago',
      input({ trips: [trip({ status: 'post_trip', endDate: '2026-09-08' })] }),
      'no_trip',
    ],
    ['only a cancelled trip', input({ trips: [trip({ status: 'cancelled' })] }), 'no_trip'],
    ['only an archived trip', input({ trips: [trip({ status: 'archived' })] }), 'no_trip'],
  ])('%s → %s', (_name, state, mode) => {
    expect(deriveHomeState(state).mode).toBe(mode);
  });

  it('ranks in trip over a final vote, a final vote over everyday, everyday over post trip', () => {
    const active = trip({ status: 'in_trip' });
    const upcoming = trip({ status: 'pre_trip' });
    const ended = trip({ status: 'post_trip', endDate: '2026-09-27' });
    expect(deriveHomeState(input({ trips: [upcoming, active], vote: vote('final') })).mode).toBe(
      'in_trip',
    );
    expect(deriveHomeState(input({ trips: [upcoming], vote: vote('final') })).mode).toBe(
      'final_vote',
    );
    expect(deriveHomeState(input({ trips: [ended, upcoming] })).mode).toBe('everyday');
  });

  it('counts down to the earliest upcoming trip, undated trips last', () => {
    const later = trip({ status: 'confirmed', startDate: '2027-01-10' });
    const sooner = trip({ status: 'setup', startDate: '2026-11-02' });
    const undated = trip({ status: 'voting', startDate: null });
    const state = deriveHomeState(input({ trips: [undated, later, sooner] }));
    expect(state.nextTrip?.id).toBe(sooner.id);
  });

  it('keeps the post-trip window in the trip zone on its last evening', () => {
    // 14 days after 2026-09-15 is 09-29; at 02:00 UTC it is already 09-29 in Makassar (UTC+8).
    const ended = trip({ status: 'post_trip', endDate: '2026-09-15' });
    expect(deriveHomeState(input({ trips: [ended] })).mode).toBe('post_trip');
    const later = new Date('2026-09-29T16:30:00Z'); // 09-30 00:30 in Makassar
    expect(deriveHomeState(input({ trips: [ended], now: later })).mode).toBe('no_trip');
  });

  it('remembers the last trip that ran for the no-trip card', () => {
    const older = trip({ status: 'archived', startDate: '2025-12-01' });
    const newer = trip({ status: 'archived', startDate: '2026-04-01' });
    expect(deriveHomeState(input({ trips: [newer, older] })).lastTrip?.id).toBe(newer.id);
  });
});
