/**
 * Fixed dates-step data over the Kyoto six for the scenes and tests: April 2027 counts as the
 * render shows them, and the three no-fit options the 3c-4 render offers.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data, never copy. */
import { DEV, kyotoTrip, SCENE_NOW, WINSTON } from '../scenes/fixtures';
import { guideName } from '../shell/guide-note';
import { heatMonths, initialMonth, type SummaryRow, type WindowOption } from './model';
import type { OwnCalendar } from './own-calendar-row';
import type { WhenModel } from './when-view';

// Free counts for April 1–30, as the 3c-3 render shows them.
const APRIL = [
  4, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 3, 3, 2, 3, 4, 5, 5, 3, 2, 2, 3, 4, 4, 3, 2, 1, 2, 3, 4,
];

export function summaries(months: readonly number[], synced = 5): SummaryRow[] {
  return months.flatMap((month) =>
    Array.from({ length: month === 4 || month === 6 ? 30 : 31 }, (_, index) => {
      const free = month === 4 ? (APRIL[index] ?? 0) : Math.max(0, (index * 7) % 6);
      return {
        date: `2027-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
        free_count: free,
        maybe_count: 0,
        busy_count: synced - Math.min(free, synced),
        unknown_count: 6 - synced,
        member_count: 6,
        computed_at: '2026-10-02T00:30:00Z',
      };
    }),
  );
}

export function option(
  partial: Partial<WindowOption> & Pick<WindowOption, 'id' | 'kind'>,
): WindowOption {
  return {
    start: '2027-04-02',
    end: '2027-04-09',
    freeCount: 6,
    memberCount: 6,
    missingIds: [],
    missedMustDoIds: [],
    askUserId: null,
    askState: null,
    priceDeltaMinor: null,
    currency: null,
    reason: 'season_peak',
    isPick: false,
    ...partial,
  };
}

export const BEST = option({ id: 'best', kind: 'best' });
export const PARTIAL = option({
  id: 'partial',
  kind: 'partial',
  freeCount: 5,
  missingIds: [DEV],
  missedMustDoIds: ['inari', 'arashiyama'],
  reason: 'partial_crew',
});
export const FULL = option({
  id: 'full',
  kind: 'full_crew',
  start: '2027-04-16',
  end: '2027-04-23',
  priceDeltaMinor: -9000,
  currency: 'USD',
  reason: 'season_trade',
});
export const ASK = option({
  id: 'ask',
  kind: 'ask_first',
  askUserId: DEV,
  isPick: true,
  reason: 'maybe_block',
});

export const SYNCED: OwnCalendar = {
  status: 'synced',
  lastSyncedAt: new Date(SCENE_NOW - 2 * 3_600_000),
};

export function whenModel(overrides: Partial<WhenModel> & { readonly me?: string }): WhenModel {
  const trip = kyotoTrip({ me: overrides.me ?? WINSTON });
  const rows = summaries([4]);
  const months = heatMonths(rows);
  return {
    isOrganiser: trip.isOrganiser,
    mode: 'best',
    place: trip.destinationName,
    guide: trip.guide,
    guideName: guideName(trip.guide),
    score: trip.score,
    members: trip.members,
    total: 6,
    synced: 5,
    months,
    startMonth: initialMonth(months, BEST),
    best: BEST,
    options: [],
    selectedId: null,
    mustDoTitles: new Map([
      ['inari', 'Inari'],
      ['arashiyama', 'Arashiyama'],
    ]),
    calendar: SYNCED,
    now: new Date(SCENE_NOW),
    busy: false,
    failure: null,
    ...overrides,
  };
}
