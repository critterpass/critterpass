import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  RESTART_MARK_TTL_MS,
  isLaunchReplay,
  markInAppRestart,
  resetLaunchReplayForTests,
} from '../launch-replay';
import { clearPendingLink, peekPendingLink, setOnboardingComplete } from '../pending';
import { configureLinkRouter, resetLinkRouterForTests, routeIncomingUrl } from '../router';

const NOW = 1_000_000;
const LAUNCH_URL = 'critterpass-dev://trips';

beforeEach(() => {
  resetLaunchReplayForTests();
  isLaunchReplay(NOW);
  resetLaunchReplayForTests();
  clearPendingLink();
  setOnboardingComplete(true);
  configureLinkRouter({ now: () => NOW });
});

afterEach(() => resetLinkRouterForTests());

describe('the launch URL after a restart the app did itself', () => {
  it('follows the link the app was opened with on a cold start', async () => {
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/trips');
  });

  it('opens Home after signing in, however often the router asks', async () => {
    markInAppRestart(NOW - 2_000);
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/');
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/');
  });

  it('keeps no link waiting for onboarding after a sign-out restart', async () => {
    setOnboardingComplete(false);
    markInAppRestart(NOW - 2_000);
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/');
    expect(peekPendingLink(NOW)).toBeNull();
  });

  it('still follows a link that arrives while the restarted app is open', async () => {
    markInAppRestart(NOW - 2_000);
    await routeIncomingUrl(LAUNCH_URL, true);
    await expect(routeIncomingUrl('critterpass-dev://g/lundi', false)).resolves.toBe(
      '/explore/lundi',
    );
  });

  it('follows the link on the next cold start: the mark is used once', async () => {
    markInAppRestart(NOW - 2_000);
    await routeIncomingUrl(LAUNCH_URL, true);
    resetLaunchReplayForTests();
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/trips');
  });

  it('ignores the mark of a restart that never came', async () => {
    markInAppRestart(NOW - RESTART_MARK_TTL_MS - 1);
    await expect(routeIncomingUrl(LAUNCH_URL, true)).resolves.toBe('/trips');
  });

  it('leaves a URL that is not ours untouched', async () => {
    markInAppRestart(NOW - 2_000);
    await expect(routeIncomingUrl('exp://127.0.0.1:8081', true)).resolves.toBe(
      'exp://127.0.0.1:8081',
    );
  });
});
