import { describe, expect, it } from 'vitest';

import { assignAwards } from './awards';
import { recapBestDay } from './best-day';
import { selectGotAway, type GotAwayCandidate } from './got-away';
import { recapBuildForEvent, RECAP_RERUN_DEBOUNCE_SECONDS, type RecapTripState } from './queues';
import { RECAP_CARDS, recapCardsCopySchema } from './schema';

const [A, B, C, D] = ['a', 'b', 'c', 'd'].map((c) => `0199a000-0000-7000-8000-00000000000${c}`) as [
  string,
  string,
  string,
  string,
];

describe('assignAwards', () => {
  it('deals each award once and each traveller once, strongest claim first', () => {
    const awards = assignAwards(
      [A, B, C, D],
      new Map([
        [A, { expenses_logged: 4, finds: 2 }],
        [B, { expenses_logged: 1, finds: 2 }],
        [C, { finds: 1 }],
      ]),
    );
    expect(awards.map((award) => [award.user_id, award.kind, award.value])).toEqual([
      [A, 'treasurer', 4],
      [B, 'critter_whisperer', 2],
      [C, 'good_company', 0],
      [D, 'good_company', 0],
    ]);
    expect(awards[0]?.evidence).toEqual({ crew_total: 5, share_pct: 80 });
  });

  it('breaks a tie on the user id, so every run deals the same hand', () => {
    const metrics = new Map([
      [B, { finds: 1 }],
      [A, { finds: 1 }],
    ]);
    expect(assignAwards([B, A], metrics).map((award) => award.kind)).toEqual([
      'good_company',
      'critter_whisperer',
    ]);
  });

  it('needs two visits to one place for a favourite, and quotes it', () => {
    const awards = assignAwards(
      [A, B],
      new Map([
        [A, { revisits: 2 }],
        [B, { revisits: 1 }],
      ]),
      new Map([
        [A, { poi_id: D, poi_name: 'Warung' }],
        [B, { poi_id: C, poi_name: 'Cafe' }],
      ]),
    );
    expect(awards[0]).toMatchObject({
      kind: 'best_find',
      evidence: { poi_id: D, poi_name: 'Warung' },
    });
    expect(awards[1]?.kind).toBe('good_company');
  });
});

describe('selectGotAway', () => {
  const candidate = (overrides: Partial<GotAwayCandidate>): GotAwayCandidate => ({
    form_id: A,
    critter_id: B,
    critter_key: 'cp-001',
    critter_no: 1,
    rarity: 'epic',
    sightings: 0,
    wandered_off: 0,
    seen_by: [],
    forms_found: 0,
    forms_total: 4,
    window: null,
    ...overrides,
  });

  it('prefers the form the crew saw most, then legendary, then the lower number', () => {
    const pick = selectGotAway(
      [
        candidate({ form_id: A, rarity: 'legendary', sightings: 0 }),
        candidate({ form_id: B, rarity: 'epic', sightings: 2, seen_by: [D, C] }),
        candidate({ form_id: C, rarity: 'legendary', sightings: 2, critter_no: 9 }),
      ],
      '2026-10-02',
      '2026-10-04',
    );
    expect(pick).toMatchObject({ form_id: C, sightings: 2 });
  });

  it('skips a form out of season and gives a seasonal one its next window', () => {
    const june = { type: 'annual_range', start: '06-01', end: '06-02' } as const;
    const october = { type: 'month_part', month: 10, part: 'early' } as const;
    expect(selectGotAway([candidate({ window: june })], '2026-10-02', '2026-10-04')).toBeNull();
    expect(
      selectGotAway([candidate({ window: october })], '2026-10-02', '2026-10-04')?.next_window,
    ).toEqual({ from: '2027-10-01', to: '2027-10-10' });
  });
});

describe('recapBestDay', () => {
  it('takes the day with the most moments, the earlier on a tie, inside the trip only', () => {
    const scores = new Map([
      ['2026-10-01', 9],
      ['2026-10-02', 3],
      ['2026-10-03', 3],
    ]);
    expect(recapBestDay(scores, '2026-10-02', '2026-10-04')).toEqual({
      day_no: 1,
      local_date: '2026-10-02',
      score: 3,
    });
    expect(recapBestDay(new Map(), '2026-10-02', '2026-10-04')).toBeNull();
  });
});

describe('recapBuildForEvent', () => {
  const trip = (status: string, today: string): RecapTripState => ({
    status,
    today,
    end_date: '2026-10-04',
  });
  const tripId = A;

  it('builds at once when the trip ends, on the earlier of its end date and today', () => {
    expect(
      recapBuildForEvent({ type: 'trip.status_changed', tripId }, trip('post_trip', '2026-10-05')),
    ).toEqual({
      queue: 'recap.build',
      data: { trip_id: tripId, reason: 'trip_ended', ended_on: '2026-10-04' },
      options: { singletonKey: `recap:${tripId}` },
    });
    expect(
      recapBuildForEvent({ type: 'trip.status_changed', tripId }, trip('post_trip', '2026-10-03'))
        ?.data.ended_on,
    ).toBe('2026-10-03');
    expect(
      recapBuildForEvent({ type: 'trip.status_changed', tripId }, trip('in_trip', '2026-10-03')),
    ).toBeNull();
  });

  it('re-runs on late data after the debounce, only within fourteen days of the end', () => {
    expect(
      recapBuildForEvent({ type: 'expense.added', tripId }, trip('post_trip', '2026-10-18')),
    ).toEqual({
      queue: 'recap.build',
      data: { trip_id: tripId, reason: 'late_data' },
      options: { singletonKey: `recap:${tripId}`, startAfter: RECAP_RERUN_DEBOUNCE_SECONDS },
    });
    expect(
      recapBuildForEvent({ type: 'expense.added', tripId }, trip('archived', '2026-10-19')),
    ).toBeNull();
    expect(
      recapBuildForEvent({ type: 'expense.added', tripId }, trip('in_trip', '2026-10-03')),
    ).toBeNull();
    expect(
      recapBuildForEvent({ type: 'chat.message_sent', tripId }, trip('post_trip', '2026-10-05')),
    ).toBeNull();
  });
});

describe('recapCardsCopySchema', () => {
  it('keys the copy by every story card, in play order', () => {
    expect(Object.keys(recapCardsCopySchema.shape)).toEqual([...RECAP_CARDS]);
  });
});
