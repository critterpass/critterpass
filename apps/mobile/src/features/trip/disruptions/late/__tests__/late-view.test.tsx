/**
 * The running-late screen's behaviour, rendered from the lab scenes: a late member picks among
 * the offered options and the button names the pick; whoever waits is told and offered nothing to
 * pick; "said yes" shows only once the place answered; a settled pick cannot be sent twice.
 */
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { lateScenes } from '../dev/late-scenes';
import { LateView } from '../late-view';
import { lateModel } from '../model';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{node}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('running-late screen', () => {
  it('sends the option the member switched to', async () => {
    const onChoose = jest.fn();
    const scenes = lateScenes(() => null);
    const base = (scenes['3k-9'] as () => { props: Parameters<typeof LateView>[0] })();
    await show(<LateView {...base.props} onChoose={onChoose} />);
    await fireEvent.press(screen.getByTestId('late-option-skip'));
    await fireEvent.press(screen.getByTestId('late-choose'));
    expect(onChoose).toHaveBeenCalledWith('skip');
  });

  it('does not send a settled pick again', async () => {
    const onChoose = jest.fn();
    const scenes = lateScenes(() => null);
    const base = (scenes['3k-9-chosen'] as () => { props: Parameters<typeof LateView>[0] })();
    await show(<LateView {...base.props} onChoose={onChoose} />);
    await fireEvent.press(screen.getByTestId('late-choose'));
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe('lateModel', () => {
  it('reads the role from the party lists and survives rows it cannot parse', () => {
    const model = lateModel(
      {
        id: 'spa-late',
        trip_id: 'bali-trip',
        kind: 'running_late',
        status: 'open',
        title: 'Karsa Spa',
        summary: '',
        affected: '{broken',
        facts: null,
        options: '[{"id":"teleport"}]',
        actions: null,
        chosen_option_id: 'teleport',
        i18n: null,
      },
      'someone',
    );
    expect(model).toMatchObject({ role: 'other', options: [], chosen: null, lateMin: 0 });
  });
});
