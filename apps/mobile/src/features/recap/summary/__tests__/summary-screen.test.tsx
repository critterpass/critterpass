/**
 * The recap page over the real local-first stack: the guide writing while the recap is queued or
 * building, the numbers once the row turns ready (every one from the row, the guide's words when
 * written), a late re-run's badge, a dropout's note, a failed build's retry without signal, and
 * WHERE NEXT? back to Home with the crew in front. Until the story has been watched the page waits
 * and the story plays first; a replay opens over the page.
 */
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { registerScreens } from '@/lib/navigation/screen-registry';
import { toastQueue } from '@/motion';

import { CHAVA, CREW, RECAP, recapRow, TRIP } from '../../dev/recap-fixtures';
import {
  renderRecap,
  seedAwards,
  seedRecap,
  seedTrip,
  until,
  type SeedTrip,
} from '../../test-support/recap-harness';
import { storySession } from '../../story/story-session';
import { RecapSummaryScreen } from '../summary-screen';

let stack: TestLocalFirst | null = null;

const WATCHED_SQL = `INSERT INTO recap_views (id, recap_id, trip_id, user_id, opened_at, completed_at)
  VALUES ('rv-1', ?, ?, ?, '2026-10-05T01:00:00Z', '2026-10-05T01:02:00Z')`;

/** A trip whose recap story the viewer has already watched, unless `watched` is false. */
async function open(options?: SeedTrip, watched = true): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedTrip(stack, options);
  if (watched) await stack.db.execute(WATCHED_SQL, [RECAP, TRIP, stack.uid]);
  return stack;
}

const visible = (testID: string) => screen.queryByTestId(testID) !== null;

afterEach(async () => {
  (router.navigate as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  storySession.reset();
  toastQueue.dismiss();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('recap page', () => {
  it('shows the guide writing until the row turns ready, then the numbers the row holds', async () => {
    const s = await open();
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-writing'));
    expect(screen.getByText('CHÀ VÁ IS WRITING YOUR RECAP')).toBeTruthy();
    await seedRecap(s, recapRow({ status: 'building' }));
    await until(() => visible('recap-writing'));

    await seedRecap(s, recapRow());
    await seedAwards(s);
    await until(() => visible('recap-tiles'));
    expect(screen.getByTestId('recap-title')).toHaveTextContent('ĐÀ NẴNG, THE RECAP');
    expect(screen.getByTestId('recap-eyebrow')).toHaveTextContent(
      /^OCT 2\s*–\s*4 · THE ĐÀ NẴNG FOUR$/u,
    );
    expect(screen.getByTestId('recap-tile-distance')).toHaveTextContent(
      '214 KMdriven, mostly by Anh Tuấn',
    );
    expect(screen.getByTestId('recap-tile-sunrise')).toHaveTextContent(
      'SƠN TRÀstarted at 05:10, before sunrise',
    );
    expect(screen.getByTestId('recap-tile-photos')).toHaveTextContent(
      '312 PHOTOSMaya took 140 of them',
    );
    expect(screen.getByTestId('recap-tile-owed')).toHaveTextContent('$0 OWEDsettled 2 days early');
    expect(screen.getByTestId('recap-forms')).toHaveTextContent(/CHÀ VÁ'S FORMS3 OF 4 FOUND/u);
    // The guide has not written the got-away line yet: the sightings stand in.
    expect(screen.getByTestId('recap-got-away-line')).toHaveTextContent(
      'The Golden Chà Vá got away. Seen 2 times, befriended by nobody.',
    );
    // The MVP first, then the viewer's own award, each with its own number.
    expect(screen.getByTestId('recap-awards')).toHaveTextContent(
      'Earliest riserJordan, up at 05:10The treasurerYou, 23 expenses logged',
    );
  });

  it('offers a retry when the build failed, and says it needs signal when offline', async () => {
    const s = await open();
    await seedRecap(s, recapRow({ status: 'failed', failure_reason: 'build_error' }));
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-failed'));
    expect(screen.queryByTestId('recap-tiles')).toBeNull();
    await fireEvent.press(screen.getByText('TRY AGAIN'));
    await until(() => toastQueue.getCurrent() !== null);
    expect(toastQueue.getCurrent()?.title).toBe('Needs signal to try again');
  });

  it("WHERE NEXT? goes back to Home with the trip's crew in front", async () => {
    const s = await open();
    await seedRecap(s, recapRow());
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-where-next'));
    await fireEvent.press(screen.getByTestId('recap-where-next'));
    expect(router.navigate).toHaveBeenCalledWith({ pathname: '/', params: { crewId: CREW } });
  });

  it('goes back to where the traveller came from, or Home when there is nowhere to go back to', async () => {
    const s = await open();
    await seedRecap(s, recapRow({ status: 'building' }));
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-back'));
    await fireEvent.press(screen.getByTestId('recap-back'));
    expect(router.back).toHaveBeenCalledTimes(1);

    (router.canGoBack as jest.Mock).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('recap-back'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith('/');
  });

  it("opens this trip's critter from the forms card, never the whole collection", async () => {
    const unregister = registerScreens({
      '3l-3': (params) => ({
        pathname: '/critters/[critterId]',
        params: { critterId: params['critterId'] ?? '' },
      }),
      '3l-9': '/critters/legendaries',
    });
    const s = await open();
    await seedRecap(s, recapRow());
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-forms'));
    await fireEvent.press(screen.getByTestId('recap-forms'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/critters/[critterId]',
      params: { critterId: CHAVA },
    });
    unregister();
  });

  it('plays the story first until it has been watched, and opens on the page after that', async () => {
    const s = await open(undefined, false);
    await seedRecap(s, recapRow());
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => (router.replace as jest.Mock).mock.calls.length > 0);
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/recap/[tripId]/story',
      params: { tripId: TRIP },
    });
    // The page waited for the story: its numbers never showed first.
    expect(visible('recap-tiles')).toBe(false);
    expect(visible('recap-loading')).toBe(true);

    // Played to its end on another phone: the page stays the page.
    (router.replace as jest.Mock).mockClear();
    await s.db.execute(WATCHED_SQL, [RECAP, TRIP, s.uid]);
    storySession.reset();
    await renderRecap(<RecapSummaryScreen tripId={TRIP} />, s);
    await until(() => visible('recap-watch'));
    expect(router.replace).not.toHaveBeenCalled();

    // Playing it again opens the story over the page, which stays underneath.
    await fireEvent.press(screen.getByTestId('recap-watch'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/recap/[tripId]/story',
      params: { tripId: TRIP, from: 'summary' },
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
