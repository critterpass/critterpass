/**
 * Home over the real local-first stack with synced rows seeded locally: what each control opens
 * (the first-run choices, Explore, the invite card, the trip under way, the header), the banner
 * while the server refuses the queue, and the tip dismissing into the queue.
 */
// Cross-fades are timing, not layout: snapshots see their settled content.
jest.mock('../fade-in-view', () => ({
  FadeInView: ({ children }: { children: unknown }) => children,
}));
// The zoom measures its source on device; here it goes straight to the push it ends with.
jest.mock('@/ui/transitions/use-shared-source', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/ui/transitions/use-shared-source'),
  zoomTo: jest.fn(() => Promise.resolve()),
}));

import { DomainError } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { enqueue } from '@/data/powersync/test-support/queue-fixtures';
import { registerScreens } from '@/lib/navigation/screen-registry';
import { motionFreeze } from '@/motion/slowmo';
import { zoomTo } from '@/ui/transitions/use-shared-source';

import { HomeScreen } from '../home-screen';
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
    '7g-3': (params) => `/place/${params['placeId'] ?? ''}`,
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
  it('shows the Explore row on the first run and a crew Home once Explore is registered', async () => {
    const s = await open();
    await seedMe(s);
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-first-run') !== null);
    // Not registered yet: no row, rather than one that opens nothing.
    expect(screen.queryByTestId('home-explore')).toBeNull();
    const unregister = registerScreens({ 'explore-home': '/explore' });
    await until(() => screen.queryByTestId('home-explore') !== null);
    expect(screen.getByText('EXPLORE')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('home-explore'));
    expect(push).toHaveBeenCalledWith('/explore');
    await screen.unmount();

    const crew = await open();
    await seedCrew(crew);
    await seedTrip(crew, { status: 'confirmed', startDate: isoDate(new Date(Date.now() + DAY)) });
    await renderHome(<HomeScreen />, crew);
    await until(() => screen.queryByTestId('home-mode-everyday') !== null);
    push.mockClear();
    await fireEvent.press(screen.getByTestId('home-explore'));
    expect(push).toHaveBeenCalledWith('/explore');
    unregister();
    await s.close();
    removeDir(s.dir);
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
    await renderHome(<HomeScreen />, s);
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
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-invite-friends') !== null);
    await fireEvent.press(screen.getByTestId('home-invite-friends-open'));
    expect(push).toHaveBeenCalledWith(`/crew/${CREW}/invite`);
  });

  it('keeps the inbox and "Your crews" in reach before the first crew', async () => {
    const s = await open();
    await seedMe(s);
    await seedInboxItem(s, { kind: 'nudge.received', needsYou: true });
    await renderHome(<HomeScreen />, s);
    await until(() => screen.queryByTestId('home-first-run') !== null);
    await until(() => screen.queryByLabelText('Inbox, 1 new') !== null);
    await fireEvent.press(screen.getByTestId('home-your-crews'));
    expect(push).toHaveBeenCalledWith('/crew');
    await fireEvent.press(screen.getByTestId('home-header-inbox'));
    expect(push).toHaveBeenCalledWith('/inbox');
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
