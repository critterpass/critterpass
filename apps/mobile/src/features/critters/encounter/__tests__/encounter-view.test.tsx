/**
 * The encounter card: the hold ring takes nothing until the dwell has made the critter ready;
 * then the visible Befriend link and the ring's accessibility action both complete it without a
 * hold; and a wandered-off encounter offers the quiet window, not a retry.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { EncounterView } from '../encounter-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const ART = {
  key: 'cp-112',
  seed: 7,
  form: null,
  rarity: 'rare' as const,
  xp: 150,
  name: 'Tokek',
  formNo: 2,
  formCount: 4,
};

async function renderLive(phase: string, kind: 'live' | 'wandered' = 'live') {
  const onHold = jest.fn();
  const onTap = jest.fn();
  const onRemind = jest.fn();
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>
            <EncounterView
              kind={kind}
              place="Tirta Empul"
              habitat="Water temples only"
              art={ART}
              phase={phase}
              progress={phase === 'ready' ? 1 : 0.4}
              legendary={false}
              crewLine={null}
              minutes={4}
              forecast={{
                when: 'Tomorrow, 07:30',
                remind: '07:00',
                bars: [20, 10, 30],
                litIndex: 1,
                hours: ['6am', 'noon', '6pm'],
              }}
              onHold={onHold}
              onTap={onTap}
              onRemind={onRemind}
              onBack={jest.fn()}
            />
          </ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return { onHold, onTap, onRemind };
}

describe('encounter card', () => {
  it('takes no hold and offers no shortcut while the ring is still filling', async () => {
    const { onHold } = await renderLive('accruing');
    const ring = screen.getByTestId('critters-encounter-hold');
    expect(ring.props.accessibilityState).toMatchObject({ disabled: true });
    expect(ring.props.accessibilityActions).toEqual([]);
    expect(screen.queryByTestId('critters-encounter-tap')).toBeNull();
    expect(screen.getByText('STAY CLOSE')).toBeTruthy();
    expect(onHold).not.toHaveBeenCalled();
  });

  it('befriends without a hold once ready: the visible link and the accessibility action', async () => {
    const { onHold, onTap } = await renderLive('ready');
    await fireEvent.press(screen.getByTestId('critters-encounter-tap'));
    expect(onTap).toHaveBeenCalledTimes(1);
    const ring = screen.getByTestId('critters-encounter-hold');
    await fireEvent(ring, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('offers the next quiet window after it wandered off, not a retry', async () => {
    const { onRemind } = await renderLive('wandered_off', 'wandered');
    expect(screen.getByText('IT WANDERED OFF')).toBeTruthy();
    expect(screen.getByText('TOMORROW, 07:30')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('critters-wandered-remind'));
    expect(onRemind).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('critters-encounter-hold')).toBeNull();
  });
});
