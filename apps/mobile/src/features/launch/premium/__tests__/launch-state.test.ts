/**
 * The stamp plays on the phone's first launch only: never again, not after a launch cut short, and
 * not on a phone that already launched the app before the redesign.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { createMMKV } from 'react-native-mmkv';

import {
  EARLIER_LAUNCH_KEY,
  ISSUED_KEY,
  finishPremiumLaunch,
  isFirstLaunch,
  issuedAt,
  premiumLaunchPending,
  resetPremiumLaunchForTests,
} from '../launch-state';

const storage = createMMKV({ id: 'premium-launch-test' });
const coldStart = () => resetPremiumLaunchForTests(storage);

describe('premium launch state', () => {
  beforeEach(() => {
    storage.clearAll();
    coldStart();
  });

  it('plays on the first launch and records the issue moment', () => {
    expect(isFirstLaunch(() => 1_760_000_000_000)).toBe(true);
    expect(premiumLaunchPending()).toBe(true);
    expect(storage.getNumber(ISSUED_KEY)).toBe(1_760_000_000_000);
    expect(issuedAt().getTime()).toBe(1_760_000_000_000);
  });

  it('never plays again, even when the first launch was cut short', () => {
    expect(premiumLaunchPending()).toBe(true);
    coldStart();
    expect(premiumLaunchPending()).toBe(false);
    expect(isFirstLaunch()).toBe(false);
  });

  it('keeps the first issue date on later launches', () => {
    isFirstLaunch(() => 1_000);
    coldStart();
    isFirstLaunch(() => 9_000);
    expect(issuedAt().getTime()).toBe(1_000);
  });

  it('plays once per runtime: finished means not pending until the next install', () => {
    expect(premiumLaunchPending()).toBe(true);
    finishPremiumLaunch();
    expect(premiumLaunchPending()).toBe(false);
  });

  it('skips the stamp on a phone that launched the app before the redesign', () => {
    storage.set(EARLIER_LAUNCH_KEY, true);
    coldStart();
    expect(premiumLaunchPending()).toBe(false);
  });

  it('marks the earlier launch hatch as played so switching back never replays it', () => {
    isFirstLaunch();
    expect(storage.getBoolean(EARLIER_LAUNCH_KEY)).toBe(true);
  });
});
