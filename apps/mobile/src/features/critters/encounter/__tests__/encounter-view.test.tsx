/**
 * The encounter card: the hold ring takes nothing until the dwell has made the critter ready;
 * then the ring's accessibility action completes it without a hold; and a wandered-off encounter
 * offers the quiet window, not a retry.
 */
// The ring and the rays build Skia paths; the Jest double draws nothing, so a path is a recorder.
jest.mock('@shopify/react-native-skia', () => {
  const path = {
    moveTo: () => path,
    lineTo: () => path,
    close: () => path,
    addArc: () => path,
    addCircle: () => path,
  };
  return {
    ...jest.requireActual<object>('@/ui/test-support/skia-double'),
    Skia: { Path: { Make: () => path } },
  };
});
jest.mock('expo-router', () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
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

import { LiveScene } from '../../premium/encounter/live-scene';
import { WanderedScene } from '../../premium/encounter/wandered-scene';

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

const FORECAST = {
  when: 'Tomorrow, 07:30',
  remind: '07:00',
  bars: [20, 10, 30],
  litIndex: 1,
  hours: ['6am', 'noon', '6pm'],
};

async function renderScene(scene: React.ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{scene}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

async function renderLive(phase: string) {
  const onHold = jest.fn();
  await renderScene(
    <LiveScene
      art={ART}
      place="Tirta Empul"
      habitat="Water temples only"
      phase={phase}
      progress={phase === 'ready' ? 1 : 0.4}
      legendary={false}
      crewLine={null}
      camera={null}
      onHold={onHold}
      onClose={jest.fn()}
    />,
  );
  return { onHold };
}

const activate = (ring: ReturnType<typeof screen.getByTestId>) =>
  fireEvent(ring, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

describe('encounter card', () => {
  it('takes no hold and no shortcut while the ring is still filling', async () => {
    const { onHold } = await renderLive('accruing');
    const ring = screen.getByTestId('critters-encounter-hold');
    expect(ring.props.accessibilityState).toMatchObject({ disabled: true });
    await activate(ring);
    expect(onHold).not.toHaveBeenCalled();
  });

  it('befriends without a hold once ready, by the ring’s accessibility action', async () => {
    const { onHold } = await renderLive('ready');
    const ring = screen.getByTestId('critters-encounter-hold');
    expect(ring.props.accessibilityState).toMatchObject({ disabled: false });
    await activate(ring);
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('offers the next quiet window after it wandered off, not a retry', async () => {
    const onRemind = jest.fn();
    await renderScene(
      <WanderedScene
        art={ART}
        place="Tirta Empul"
        habitat="Water temples only"
        minutes={4}
        forecast={FORECAST}
        onRemind={onRemind}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText('It wandered off')).toBeTruthy();
    expect(screen.getByText('Tomorrow, 07:30')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('critters-encounter-remind'));
    expect(onRemind).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('critters-encounter-hold')).toBeNull();
  });
});
