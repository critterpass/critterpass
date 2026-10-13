/**
 * Home over the real local-first stack with synced rows seeded locally: every mode renders from
 * local data (first run, everyday, final vote through the registered slot, no trip, in trip, post
 * trip), the skeleton shows only on a first sync with nothing local, the bell carries the
 * needs-you count, a tip without a place dismisses into the queue, and every control pushes its
 * route (the destination, the trip hub and the recap through the registry).
 */

import { DomainError } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { enqueue } from '@/data/powersync/test-support/queue-fixtures';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { registerScreens } from '@/lib/navigation/screen-registry';
import { motionFreeze } from '@/motion/slowmo';

// The store SDK is a native boundary Home never calls here.
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { HomePremiumScreen } from '../premium/home-premium-screen';
import { registerHomeVoteSlot } from '../slots';
import {
  BALI,
  CREW,
  TRIP,
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
    '7g-3': (params) => `/place/${params['placeId'] ?? ''}`,
    '3b-7': '/place-search',
    '3k-1': (params) => `/trip/${params['tripId'] ?? ''}`,
    '3m-1': (params) => `/recap/${params['tripId'] ?? ''}`,
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

const confirmedTrip = async (s: TestLocalFirst) => {
  const target = new Date(Date.now() + 17 * DAY + 5 * 3_600_000 + 30 * 60_000);
  await seedTrip(s, {
    status: 'confirmed',
    startDate: isoDate(new Date(target.getTime() + DAY)),
    countdownTargetAt: target.toISOString(),
  });
};

const tip = (s: TestLocalFirst, id: string, placeId: string | null) =>
  s.db.execute(
    `INSERT INTO home_tips (id, crew_id, kind, text, place_id, status, valid_until, created_at)
     VALUES (?, ?, 'fare_drop', 'Flights from Singapore drop to $412.', ?, 'active', ?, ?)`,
    [id, CREW, placeId, new Date(Date.now() + DAY).toISOString(), new Date().toISOString()],
  );

describe('modes', () => {
  it('shows the skeleton on a first sync with nothing local', async () => {
    const s = await open();
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-loading') !== null);
    // Maestro flows reach the (dev) screens from here, even before the first sync.
    expect(screen.getByTestId('dev-tools-entry')).toBeTruthy();
  });

  it('renders first run with starting a crew and the code entry', async () => {
    const s = await open();
    await seedMe(s);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-first-run') !== null);
    await fireEvent.press(screen.getByTestId('home-join-code'));
    expect(push).toHaveBeenCalledWith('/onboarding/invite/code');
    await fireEvent.press(screen.getByTestId('home-start-crew'));
    expect(push).toHaveBeenCalledWith('/crew/new');
    expect(screen.getByTestId('dev-tools-entry')).toBeTruthy();
  });

  it('renders everyday with the next trip, plan progress, the bell count and the tip', async () => {
    const s = await open();
    await seedCrew(s);
    await confirmedTrip(s);
    await seedInboxItem(s, { kind: 'nudge.received', needsYou: true });
    await tip(s, 'tip-1', BALI);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-mode-everyday') !== null);
    await until(() => screen.queryByTestId('home-next-up') !== null);
    expect(screen.getByTestId('home-plan-progress')).toBeTruthy();
    await until(() => screen.queryByLabelText('Inbox, 1') !== null);
    expect(screen.getByText(/Flights from Singapore drop to \$412\./)).toBeTruthy();
  });

  it('renders the final vote through the registered slot', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, { status: 'voting', destinationId: null });
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
      await renderHome(<HomePremiumScreen />, s);
      await until(() => screen.queryByTestId('home-mode-final_vote') !== null);
      expect(screen.getByTestId('vote-slot')).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('lets the vote stand as next up while the trip is still choosing its place', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, { status: 'voting', destinationId: null });
    const unregister = registerHomeVoteSlot({
      useVote: (crewId) =>
        crewId === CREW
          ? {
              pollId: 'poll-1',
              stage: 'board',
              candidates: [],
              votersIn: 1,
              memberCount: 1,
              closesAt: null,
            }
          : null,
      Component: ({ vote }) => <Text testID="vote-slot">{vote.stage}</Text>,
    });
    try {
      await renderHome(<HomePremiumScreen />, s);
      await until(() => screen.queryByTestId('vote-slot') !== null);
      // The trip's rows land after the vote's: give them time to, and the card still stays away.
      await expect(
        until(() => screen.queryByTestId('home-next-up') !== null, 1500),
      ).rejects.toThrow();
    } finally {
      unregister();
    }
  });

  it('renders no trip with the pitch control when nothing is planned', async () => {
    const s = await open();
    await seedCrew(s);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-no-trip') !== null);
    // Three in the crew: nothing asks them to invite friends.
    expect(screen.queryByTestId('home-invite-friends')).toBeNull();
  });

  it('says changes are not being sent while the server refuses the queue, until it drains', async () => {
    let down = true;
    stack = await openTestLocalFirst({
      holdUploads: true,
      transport: {
        postJson(_path, body) {
          const refusal = new DomainError('FORBIDDEN');
          const ids = (body as { ops: { op_id: string }[] }).ops.map((op) => op.op_id);
          return Promise.resolve(
            down
              ? { status: refusal.http, body: refusal.toResponseBody() }
              : {
                  status: 200,
                  body: { results: ids.map((id) => ({ op_id: id, status: 'applied' })) },
                },
          );
        },
      },
    });
    const s = stack;
    await seedCrew(s);
    await enqueue(s.db, s.uid, 'create_test_crew', {});
    await s.value.queue.flush();
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-sync-held') !== null);

    down = false;
    await s.value.queue.retryNow();
    await until(() => screen.queryByTestId('home-sync-held') === null);
    expect(screen.getByTestId('home-no-trip')).toBeTruthy();
  });

  it('gives a crew of one the way to invite friends', async () => {
    const s = await open();
    await seedCrew(s);
    await s.db.execute('DELETE FROM crew_members WHERE user_id <> ?', [s.uid]);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-invite-friends') !== null);
    await fireEvent.press(screen.getByLabelText(/Invite/));
    expect(push).toHaveBeenCalledWith(`/crew/${CREW}/invite`);
  });

  it('keeps the inbox in reach before the first crew', async () => {
    const s = await open();
    await seedMe(s);
    await seedInboxItem(s, { kind: 'nudge.received', needsYou: true });
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-first-run') !== null);
    await until(() => screen.queryByLabelText('Inbox, 1') !== null);
    await fireEvent.press(screen.getByTestId('home-bell'));
    expect(push).toHaveBeenCalledWith('/inbox');
  });

  it('welcomes the crew back for two weeks after the last day, with the recap', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, {
      status: 'post_trip',
      startDate: isoDate(new Date(Date.now() - 8 * DAY)),
      endDate: isoDate(new Date(Date.now() - DAY)),
    });
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-mode-post_trip') !== null);
    await until(() => screen.queryByTestId('home-back-recap') !== null);
    await fireEvent.press(screen.getByTestId('home-back-recap'));
    expect(push).toHaveBeenCalledWith(`/recap/${TRIP}`);
  });

  it('renders the in-trip card during the trip and opens the hub', async () => {
    const s = await open();
    await seedCrew(s);
    await seedTrip(s, {
      status: 'in_trip',
      startDate: isoDate(new Date(Date.now() - 2 * DAY)),
      countdownTargetAt: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-mode-in_trip') !== null);
    await until(() => screen.queryByTestId('home-in-trip') !== null);
    // The card is a zoom link: pressing what it shows opens the hub.
    await fireEvent.press(within(screen.getByTestId('home-in-trip')).getAllByText(/Bali/i)[0]!);
    expect(push).toHaveBeenCalledWith(`/hub/${TRIP}`);
  });
});

describe('tips', () => {
  it('opens the place a tip is about', async () => {
    const s = await open();
    await seedCrew(s);
    await confirmedTrip(s);
    await tip(s, 'tip-1', BALI);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-tip') !== null);
    await fireEvent.press(screen.getByLabelText('Show me'));
    expect(push).toHaveBeenCalledWith(`/place/${BALI}`);
  });

  it('queues dismiss_tip for a tip without a place and hides it', async () => {
    const s = await open();
    await seedCrew(s);
    await tip(s, 'tip-2', null);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-tip') !== null);
    await fireEvent.press(screen.getByLabelText('Got it'));
    await waitFor(async () =>
      expect(await queued(s, 'dismiss_tip')).toEqual([{ tip_id: 'tip-2' }]),
    );
    await waitFor(() => expect(screen.queryByTestId('home-tip')).toBeNull());
  });
});

describe('navigation', () => {
  it('opens the inbox and the crew chat from the header', async () => {
    const s = await open();
    await seedCrew(s);
    await confirmedTrip(s);
    await renderHome(<HomePremiumScreen />, s);
    await until(() => screen.queryByTestId('home-chat') !== null);
    await fireEvent.press(screen.getByTestId('home-bell'));
    expect(push).toHaveBeenCalledWith('/inbox');
    await fireEvent.press(screen.getByTestId('home-chat'));
    expect(push).toHaveBeenCalledWith(`/crew/${CREW}/chat`);
  });
});
