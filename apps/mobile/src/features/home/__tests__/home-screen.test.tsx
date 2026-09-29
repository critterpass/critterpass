/**
 * Home over the real local-first stack with synced rows seeded locally: every mode renders from
 * local data (first run, everyday, final vote through the registered slot, no trip, in trip, post
 * trip), the skeleton shows only on a first sync with nothing local, the countdown ticks and reads
 * as words, the bell carries the needs-you count, the tip dismisses into the queue, and every
 * control pushes its route (the destination and place search through the registry).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// Cross-fades are timing, not layout: snapshots see their settled content.
jest.mock('../fade-in-view', () => ({
  FadeInView: ({ children }: { children: unknown }) => children,
}));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Link: ({ children }: { children: unknown }) => children,
}));
// The zoom measures its source on device; here it goes straight to the push it ends with.
jest.mock('@/ui/transitions/use-shared-source', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/ui/transitions/use-shared-source'),
  zoomTo: jest.fn(() => Promise.resolve()),
}));

import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { registerScreens } from '@/lib/navigation/screen-registry';
import { motionFreeze } from '@/motion/slowmo';
import { zoomTo } from '@/ui/transitions/use-shared-source';

import { HomeScreen } from '../home-screen';
import { registerHomeVoteSlot } from '../slots';
import {
  BALI,
  CREW,
  queued,
  renderHome,
  seedCrew,
  seedInboxItem,
  seedMe,
  seedTrip,
  until,
} from '../test-support/home-harness';

const DAY = 86_400_000;
let stack: TestLocalFirst | null = null;
const push = router.push as jest.Mock;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  return stack;
}

beforeAll(() => {
  // Idle loops sample one shared clock that ticks on real timers, so a late re-render would
  // snapshot a critter mid-float. Motion freeze (the Maestro screenshot mode) holds the clock at
  // its first frame, so every snapshot sees the same pose however long the screen took to settle.
  motionFreeze.value = true;
  registerScreens({
    '3d-1': (params) => `/place/${params['placeId'] ?? ''}`,
    '3b-7': '/place-search',
    '3k-1': (params) => `/trip/${params['tripId'] ?? ''}`,
  });
});

afterAll(() => {
  motionFreeze.value = false;
});

afterEach(async () => {
  push.mockClear();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

describe('modes', () => {
  it('shows the skeleton on a first sync with nothing local', async () => {
    const s = await open();
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-loading') !== null);
    // Maestro flows reach the (dev) screens from here, even before the first sync.
    expect(screen.getByTestId('dev-tools-entry')).toBeTruthy();
  });

  it('renders first run with the six guides and the code entry', async () => {
    const s = await open();
    await seedMe(s);
    await s.db.execute(
      "INSERT INTO critter_sets (id, code, name, guide_slug, destination_id) VALUES ('cs-1', 'bali', 'Bali', 'tokek', ?)",
      [BALI],
    );
    await s.db.execute("INSERT INTO destinations (id, slug, name) VALUES (?, 'bali', 'Bali')", [
      BALI,
    ]);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-first-run') !== null);
    expect(screen.getByText('WELCOME, WINSTON')).toBeTruthy();
    for (const guide of ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco']) {
      expect(screen.getByTestId(`home-guide-${guide}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('home-join-code'));
    expect(push).toHaveBeenCalledWith('/onboarding/invite/code');
    await fireEvent.press(screen.getByTestId('home-guide-tokek'));
    expect(zoomTo).toHaveBeenCalledWith('guide-cell-tokek', `/place/${BALI}`, { hop: true });
    await fireEvent.press(screen.getByTestId('home-somewhere-else'));
    expect(push).toHaveBeenCalledWith('/place-search');
    expect(screen.getByTestId('dev-tools-entry')).toBeTruthy();
  });
  it('renders everyday with a ticking countdown, plan progress, the bell count and the tip', async () => {
    const s = await open();
    await seedCrew(s);
    const target = new Date(Date.now() + 17 * DAY + 5 * 3_600_000 + 30 * 60_000);
    await seedTrip(s, {
      status: 'confirmed',
      startDate: isoDate(new Date(target.getTime() + DAY)),
      countdownTargetAt: target.toISOString(),
    });
    await seedInboxItem(s, { kind: 'nudge.received', needsYou: true });
    await s.db.execute(
      `INSERT INTO home_tips (id, crew_id, kind, text, place_id, status, valid_until, created_at)
       VALUES ('tip-1', ?, 'fare_drop', 'Flights from Singapore drop to $412.', ?, 'active', ?, ?)`,
      [CREW, BALI, new Date(Date.now() + DAY).toISOString(), new Date().toISOString()],
    );
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-mode-everyday') !== null);
    expect(screen.getByText('BALI')).toBeTruthy();
    expect(screen.getByText(/^17D \d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByLabelText(/^17 days, 5 hours to Bali$/)).toBeTruthy();
    expect(screen.getByText('PLAN 80%')).toBeTruthy();
    await until(() => screen.queryByLabelText('Inbox, 1 new') !== null);
    expect(screen.getByText('Flights from Singapore drop to $412.')).toBeTruthy();
  });
  it('renders the final vote through the registered slot', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, { status: 'voting' });
    const unregister = registerHomeVoteSlot({
      useVote: (crewId) =>
        crewId === CREW
          ? {
              pollId: 'poll-1',
              stage: 'final',
              candidates: [],
              votersIn: 4,
              memberCount: 6,
              closesAt: null,
            }
          : null,
      Component: ({ vote }) => <Text testID="vote-slot">{vote.stage}</Text>,
    });
    try {
      await renderHome(<HomeScreen />, s);
      await until(() => screen.queryByTestId('home-mode-final_vote') !== null);
      expect(screen.getByTestId('vote-slot')).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('renders no trip with the pitch control when nothing is planned', async () => {
    const s = await open();
    await seedCrew(s);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-no-trip') !== null);
  });

  it('renders the recap card for two weeks after the last day', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, {
      status: 'post_trip',
      startDate: isoDate(new Date(Date.now() - 8 * DAY)),
      endDate: isoDate(new Date(Date.now() - DAY)),
    });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-mode-post_trip') !== null);
    expect(screen.getByText('BALI RECAP')).toBeTruthy();
  });
  it('renders the in-trip card during the trip and opens the hub', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, {
      status: 'in_trip',
      startDate: isoDate(new Date(Date.now() - 2 * DAY)),
      countdownTargetAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-mode-in_trip') !== null);
    await fireEvent.press(screen.getByTestId('home-in-trip'));
    expect(push).toHaveBeenCalledWith('/trip/0192f000-0000-7000-8000-0000000000f1');
  });
});

describe('tip strip', () => {
  it('queues dismiss_tip on a fling and hides the tip at once', async () => {
    const s = await open();
    await seedCrew(s);
    await s.db.execute(
      `INSERT INTO home_tips (id, crew_id, kind, text, place_id, status, valid_until, created_at)
       VALUES ('tip-2', ?, 'crowd_dip', 'Bali is at its quietest in February.', ?, 'active', ?, ?)`,
      [CREW, BALI, new Date(Date.now() + DAY).toISOString(), new Date().toISOString()],
    );
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-tip') !== null);
    await fireEvent(screen.getByTestId('home-tip-swipe'), 'accessibilityAction', {
      nativeEvent: { actionName: 'swipeLeft' },
    });
    await waitFor(async () =>
      expect(await queued(s, 'dismiss_tip')).toEqual([{ tip_id: 'tip-2' }]),
    );
    await waitFor(() => expect(screen.queryByTestId('home-tip')).toBeNull());
  });
});

describe('navigation', () => {
  it('opens the destination, the crews sheet, the inbox and the chat', async () => {
    const s = await open();
    await seedCrew(s);
    const target = new Date(Date.now() + 17 * DAY + 5 * 3_600_000 + 30 * 60_000);
    await seedTrip(s, {
      status: 'confirmed',
      startDate: isoDate(new Date(target.getTime() + DAY)),
      countdownTargetAt: target.toISOString(),
    });
    await seedInboxItem(s, { kind: 'nudge.received', needsYou: true });
    await s.db.execute(
      `INSERT INTO home_tips (id, crew_id, kind, text, place_id, status, valid_until, created_at)
       VALUES ('tip-1', ?, 'fare_drop', 'Flights from Singapore drop to $412.', ?, 'active', ?, ?)`,
      [CREW, BALI, new Date(Date.now() + DAY).toISOString(), new Date().toISOString()],
    );
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-mode-everyday') !== null);
    expect(screen.getByText('BALI')).toBeTruthy();
    expect(screen.getByText(/^17D \d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(screen.getByLabelText(/^17 days, 5 hours to Bali$/)).toBeTruthy();
    expect(screen.getByText('PLAN 80%')).toBeTruthy();
    await until(() => screen.queryByLabelText('Inbox, 1 new') !== null);
    expect(screen.getByText('Flights from Singapore drop to $412.')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-tip'));
    expect(push).toHaveBeenCalledWith(`/place/${BALI}`);
    await fireEvent.press(screen.getByTestId('home-header-crew'));
    expect(push).toHaveBeenCalledWith('/crew');
    await fireEvent.press(screen.getByTestId('home-header-inbox'));
    expect(push).toHaveBeenCalledWith('/inbox');
    await fireEvent.press(screen.getByTestId('home-header-chat'));
    expect(push).toHaveBeenCalledWith(`/crew/${CREW}/chat`);
  });
});
