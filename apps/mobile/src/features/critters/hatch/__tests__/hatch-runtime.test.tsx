/**
 * The hatch watcher over the real local-first stack: an egg that hatched while the ceremony
 * hasn't played here opens 3l-1 once, at a calm moment on a tab root, and never over a boarding
 * pass, a sheet or a flow in progress.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
let mockPathname = '/pass';
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { EGG, seedCritters, TRIP } from '../../test-support/seed-critters';
import { markHatchSeen } from '../hatch-model';
import { CALM_MS, HatchRuntime, isCalmPath } from '../hatch-runtime';

configure({ asyncUtilTimeout: 6000 });

const stacks: TestLocalFirst[] = [];
const push = router.push as jest.Mock;
const HATCH = { pathname: '/(modal)/hatch/[tripId]', params: { tripId: TRIP } };

beforeEach(() => {
  push.mockClear();
});

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

async function mount() {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await seedCritters(stack.db, stack.uid, { egg: 'hatched' });
  const view = await render(
    <LocalFirstProvider value={stack.value}>
      <HatchRuntime />
    </LocalFirstProvider>,
  );
  return view;
}

const settle = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('hatch watcher', () => {
  it('knows the calm tab roots from everything else', () => {
    expect(['/', '/pass', '/trips', '/trips/abc'].every(isCalmPath)).toBe(true);
    expect(
      ['/wallet/bookings/pass/b1', '/guide/new', '/onboarding/name', '/trips/abc/day/today'].some(
        isCalmPath,
      ),
    ).toBe(false);
  });

  // Runs before the once-per-egg case, which marks the seeded egg seen on this device.
  it('waits while a boarding pass is up, then opens once back on a tab', async () => {
    mockPathname = '/wallet/bookings/pass/b1';
    const view = await mount();
    await settle(CALM_MS + 1000);
    expect(push).not.toHaveBeenCalled();
    mockPathname = '/trips';
    await view.rerender(
      <LocalFirstProvider value={stacks[0]!.value}>
        <HatchRuntime />
      </LocalFirstProvider>,
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(HATCH));
  });

  it('opens the ceremony once per egg at a calm moment', async () => {
    mockPathname = '/pass';
    const view = await mount();
    await waitFor(() => expect(push).toHaveBeenCalledWith(HATCH));
    markHatchSeen(EGG);
    // A later session on this device: the ceremony doesn't play again.
    await view.unmount();
    mockPathname = '/';
    await render(
      <LocalFirstProvider value={stacks[0]!.value}>
        <HatchRuntime />
      </LocalFirstProvider>,
    );
    await settle(CALM_MS + 500);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
