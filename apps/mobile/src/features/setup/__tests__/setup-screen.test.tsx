/**
 * The setup wizard over the real local-first stack: the step machine from `trips.setup_step`
 * (locked steps checked, which steps open), the step on screen, setup shut while the vote is open,
 * a refused step move, and locking the dates through the command client.
 */
// The app's own database module loads the native driver; these tests run on the test stack.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  // The premium pages declare their native header through the stack's screen.
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { TRIP_ID } from '../test-support/setup-fixtures';
import { PREMIUM_STEP_VIEWS } from '../premium/steps/premium-steps';
import { SetupScreen } from '../shell/setup-screen';
import { doneSteps, landingStep, openableSteps, shownStep, stepFromSlug } from '../shell/steps';
import { renderSetup, seedKyoto } from '../test-support/setup-harness';

// Real encrypted databases and queues: CI runners are about three times slower than a laptop.
jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
  jest.clearAllMocks();
});

describe('setup step machine', () => {
  it('checks the steps before the current one and opens only those and the current one', () => {
    expect([...doneSteps('rooms')]).toEqual(['when', 'budget']);
    expect([...openableSteps('rooms')].sort()).toEqual(['budget', 'rooms', 'when']);
    expect([...doneSteps('done')]).toEqual(['when', 'budget', 'rooms', 'must_dos']);
    expect(landingStep('done')).toBe('must_dos');
    expect(stepFromSlug('must-dos')).toBe('must_dos');
    expect(stepFromSlug('nope')).toBeNull();
  });

  it('shows the step setup is on for a link to one it has not reached, unless this phone moved there', () => {
    const never = () => false;
    expect(shownStep('rooms', 'when', never)).toBe('when');
    expect(shownStep('must_dos', 'rooms', never)).toBe('rooms');
    expect(shownStep('when', 'rooms', never)).toBe('when');
    expect(shownStep(null, 'done', never)).toBe('must_dos');
    // The phone's own move is drawn while the trip's synced row catches up.
    expect(shownStep('budget', 'when', (step) => step === 'budget')).toBe('budget');
  });
});

describe('setup screen', () => {
  it('shows the organiser the step setup is on', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'when' });
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });

    expect(await screen.findByTestId(/^setup-when-/)).toBeTruthy();
    expect(screen.queryByTestId('must-dos-screen')).toBeNull();
  });

  it('keeps setup shut while the destination vote is still open', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'when' });
    await stack.db.execute(`UPDATE trips SET status = 'voting' WHERE id = ?`, [TRIP_ID]);
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });

    expect(await screen.findByTestId('setup-vote-open')).toBeTruthy();
    expect(screen.getByText('The vote isn’t over yet')).toBeTruthy();
    expect(screen.queryByTestId(/^setup-when-/)).toBeNull();
  });

  it('draws the step setup is on for a push to one not reached, then the asked one once it is', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'when' });
    await renderSetup(<SetupScreen tripId={TRIP_ID} step="must_dos" views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });

    // The step ahead is not drawn, so its actions cannot be tapped.
    expect(await screen.findByTestId(/^setup-when-/)).toBeTruthy();
    expect(screen.queryByTestId('must-dos-screen')).toBeNull();
    // The push beat the sync: the trip's row arrives and the step asked for opens.
    await stack.db.execute(`UPDATE trips SET setup_step = 'must_dos' WHERE id = ?`, [TRIP_ID]);
    expect(await screen.findByTestId('must-dos-screen')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('puts the organiser back on the step the server holds when a step move is refused', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'rooms' });
    // Rooms has nothing to decide here, so the app moves on to must-dos by itself.
    await renderSetup(<SetupScreen tripId={TRIP_ID} step="rooms" views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/[tripId]/setup/[step]',
        params: { tripId: TRIP_ID, step: 'must-dos' },
      }),
    );
    await screen.unmount();
    jest.mocked(router.replace).mockClear();
    await renderSetup(<SetupScreen tripId={TRIP_ID} step="must_dos" views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });
    await screen.findByTestId('must-dos-screen');
    expect(router.replace).not.toHaveBeenCalled();
    // The server then refused the move and stayed on rooms.
    await stack.db.execute(
      `INSERT INTO rejected_commands (id, cmd, code, detail, rejected_at)
       VALUES ('op-1', 'set_setup_step', 'STATE_INVALID', ?, '2026-10-01T10:55:07Z')`,
      [JSON.stringify({ reason: 'step_not_done', step: 'rooms' })],
    );
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/[tripId]/setup/[step]',
        params: { tripId: TRIP_ID, step: 'rooms' },
      }),
    );
  });

  it('locks the best week through the command client and says when it needs signal', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'when' });
    await stack.db.execute(
      `INSERT INTO availability_summaries (id, trip_id, date, free_count, maybe_count, busy_count,
         unknown_count, member_count) VALUES ('s1', ?, '2027-04-02', 6, 0, 0, 0, 6)`,
      [TRIP_ID],
    );
    await stack.db.execute(
      `INSERT INTO date_window_options (id, trip_id, position, kind, start_date, end_date,
         free_count, member_count, reason, is_pick)
       VALUES ('best', ?, 0, 'best', '2027-04-02', '2027-04-09', 6, 6, 'full_crew', 1)`,
      [TRIP_ID],
    );
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} views={PREMIUM_STEP_VIEWS} />, {
      stack,
    });
    await fireEvent.press(await screen.findByTestId('when-cta'));
    // The api is unreachable here: an online-only lock comes back unavailable.
    expect(await screen.findByText('Locking needs signal. Try again in a moment.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
