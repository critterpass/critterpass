/**
 * The guide the shell shows: the Home crew's trip under way, else its next locked-in trip, else
 * the default. The selection is pure; the hook reads it from the local database's synced rows.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { DEFAULT_GUIDE, provideActiveGuide, useActiveGuide } from '@/lib/navigation/active-guide';

import { currentTripGuide, useCurrentTripGuide, type TripGuideRow } from '../data/use-trip-guide';
import { CREW, seedCrew, seedTrip, TRIP, until } from '../test-support/home-harness';

const trip = (over: Partial<TripGuideRow>): TripGuideRow => ({
  id: 'trip-1',
  status: 'confirmed',
  start_date: '2026-10-01',
  guide_slug: 'chava',
  ...over,
});

describe('the current trip’s guide', () => {
  it('is the guide of a trip under way or locked in', () => {
    expect(currentTripGuide([trip({ status: 'in_trip' })])).toEqual({ guideId: 'chava' });
    expect(currentTripGuide([trip({ status: 'confirmed' })])).toEqual({ guideId: 'chava' });
    expect(currentTripGuide([trip({ status: 'pre_trip' })])).toEqual({ guideId: 'chava' });
  });

  it('leaves the default with no trip, or one still being planned or already over', () => {
    expect(currentTripGuide([])).toBeNull();
    for (const status of ['voting', 'won', 'setup', 'drafting', 'draft_review', 'proposed']) {
      expect(currentTripGuide([trip({ status })])).toBeNull();
    }
    expect(currentTripGuide([trip({ status: 'post_trip' })])).toBeNull();
    expect(currentTripGuide([trip({ status: 'cancelled' })])).toBeNull();
    // A guide the app has no sticker for, or a trip with none.
    expect(currentTripGuide([trip({ guide_slug: 'someone-new' })])).toBeNull();
    expect(currentTripGuide([trip({ guide_slug: null })])).toBeNull();
  });

  it('prefers the trip under way, then the one that starts first', () => {
    const later = trip({ id: 'b', start_date: '2026-12-01', guide_slug: 'pon' });
    const sooner = trip({ id: 'a', start_date: '2026-10-05', guide_slug: 'sardi' });
    expect(currentTripGuide([later, sooner])).toEqual({ guideId: 'sardi' });
    const underWay = trip({ id: 'c', status: 'in_trip', start_date: '2026-12-20' });
    expect(currentTripGuide([later, sooner, underWay])).toEqual({ guideId: 'chava' });
  });
});

describe('the shell’s guide', () => {
  let stack: TestLocalFirst | null = null;

  afterEach(async () => {
    provideActiveGuide(() => null);
    await stack?.close();
    if (stack) removeDir(stack.dir);
    stack = null;
  });

  function Probe() {
    return <Text testID="guide">{useActiveGuide().guideId}</Text>;
  }
  const shown = () => String(screen.getByTestId('guide').props.children);

  it('follows the Home crew’s trip as it is locked in', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    provideActiveGuide(useCurrentTripGuide);
    await seedCrew(stack);
    await stack.db.execute(
      "INSERT INTO guides (id, slug, name, colour) VALUES ('g-chava', 'chava', 'Chà Vá', NULL)",
    );
    await seedTrip(stack, { status: 'drafting', startDate: '2026-10-01' });
    await stack.db.execute("UPDATE trips SET guide_id = 'g-chava' WHERE id = ?", [TRIP]);
    await render(
      <LocalFirstProvider value={stack.value}>
        <Probe />
      </LocalFirstProvider>,
    );
    // Still being drafted: as before, the default guide.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(shown()).toBe(DEFAULT_GUIDE.guideId);
    await stack.db.execute("UPDATE trips SET status = 'confirmed' WHERE id = ?", [TRIP]);
    await until(() => shown() === 'chava');
    // Another crew's trip is not this Home's.
    await stack.db.execute("UPDATE trips SET crew_id = 'other-crew' WHERE id = ?", [TRIP]);
    await until(() => shown() === DEFAULT_GUIDE.guideId);
    await stack.db.execute("UPDATE trips SET crew_id = ?, status = 'in_trip' WHERE id = ?", [
      CREW,
      TRIP,
    ]);
    await until(() => shown() === 'chava');
  });

  it('is the default where no session database is open', async () => {
    provideActiveGuide(useCurrentTripGuide);
    await render(<Probe />);
    expect(shown()).toBe(DEFAULT_GUIDE.guideId);
  });
});
