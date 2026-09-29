/**
 * The setup wizard over the real local-first stack: the step machine from `trips.setup_step`
 * (locked steps checked, the step on screen highlighted, which chips open), the destination
 * vote's tag, the organiser's view against a member's (who runs setup, no organiser actions), and
 * the loading and missing-trip states.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { TRIP_ID } from '../scenes/fixtures';
import { SetupScreen } from '../shell/setup-screen';
import { doneSteps, landingStep, openableSteps, stepFromSlug } from '../shell/steps';
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
});

describe('setup screen', () => {
  it('shows the organiser the step setup is on, with the vote tag and the chips', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'when' });
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} />, { stack });

    expect(await screen.findByText('WHEN CAN EVERYONE GO?')).toBeTruthy();
    expect(screen.getByLabelText('Kyoto won 4–2')).toBeTruthy();
    expect(screen.getByLabelText('Step 1, When')).toBeTruthy();
    expect(screen.queryByTestId('setup-member-status')).toBeNull();
  });

  it('marks locked steps done and moves between them through the route', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'organiser', step: 'rooms' });
    await renderSetup(<SetupScreen tripId={TRIP_ID} step="when" />, { stack });

    expect(await screen.findByLabelText('Step 2, Budget, done')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Step 3, Rooms'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/[tripId]/setup/[step]',
      params: { tripId: TRIP_ID, step: 'rooms' },
    });
    // Must-dos is not open yet: not a button.
    expect(screen.getByTestId('setup-step-must_dos').props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
  });

  it('tells a member who runs setup', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack, { as: 'member', step: 'when' });
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} />, { stack });

    expect(await screen.findByText('Winston runs setup. Your part is below.')).toBeTruthy();
    expect(screen.queryByTestId('when-cta')).toBeNull();
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
    await renderSetup(<SetupScreen tripId={TRIP_ID} step={null} />, { stack });
    await fireEvent.press(await screen.findByTestId('when-cta'));
    // The api is unreachable here: an online-only lock comes back unavailable.
    expect(await screen.findByText('Locking needs signal. Try again in a moment.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('explains a trip that has not synced to this phone', async () => {
    stack = await openTestLocalFirst();
    await seedKyoto(stack);
    await renderSetup(<SetupScreen tripId="0199a6f0-0000-7000-8000-0000000000ff" step={null} />, {
      stack,
    });
    expect(await screen.findByText('THIS TRIP ISN’T HERE YET')).toBeTruthy();
  });
});
