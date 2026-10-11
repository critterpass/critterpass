// The shared Reanimated stand-in has no `ReduceMotion`, which the premium springs read at import.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));

/**
 * The first-launch overlay waits for the native launch screen to go, hands the cover's resting
 * frame to the welcome screen, then leaves; later cold starts render nothing at all.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react-native';
import { createMMKV } from 'react-native-mmkv';

import { PremiumLaunch } from '../PremiumLaunch';
import { isFirstLaunch, resetPremiumLaunchForTests } from '../launch-state';
import { beatAt, type LaunchCoverFrame } from '../launch-timeline';

const storage = createMMKV({ id: 'premium-launch-overlay-test' });
const queryOverlay = () => screen.queryByTestId('premium-launch', { includeHiddenElements: true });

async function mount(props: {
  revealed: boolean;
  onSettled?: (cover: LaunchCoverFrame) => void;
  onDone?: () => void;
}) {
  return await render(
    <I18nProvider i18n={i18n}>
      <PremiumLaunch {...props} />
    </I18nProvider>,
  );
}

describe('PremiumLaunch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    storage.clearAll();
    resetPremiumLaunchForTests(storage);
  });
  afterEach(() => jest.useRealTimers());

  it('holds on the launch frame until the launch screen goes, then settles and leaves', async () => {
    const onSettled = jest.fn<(cover: LaunchCoverFrame) => void>();
    const onDone = jest.fn();
    const view = await mount({ revealed: false, onSettled, onDone });
    expect(queryOverlay()).not.toBeNull();
    await act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(onSettled).not.toHaveBeenCalled();

    await view.rerender(
      <I18nProvider i18n={i18n}>
        <PremiumLaunch revealed onSettled={onSettled} onDone={onDone} />
      </I18nProvider>,
    );
    await act(() => {
      jest.advanceTimersByTime(beatAt('settled'));
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled.mock.calls[0]?.[0].rotate).toBe(-5);
    await act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(queryOverlay()).toBeNull();
  });

  it('renders nothing on a later cold start', async () => {
    isFirstLaunch();
    resetPremiumLaunchForTests(storage);
    await mount({ revealed: true });
    expect(queryOverlay()).toBeNull();
  });
});
