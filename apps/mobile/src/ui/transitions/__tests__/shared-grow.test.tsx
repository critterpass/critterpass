import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render } from '@testing-library/react-native';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Stack } from 'expo-router/js-stack';
import { useEffect } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { ThemeProvider } from '../../../lib/theme';
import { useMotionMode } from '../../../motion/motion-mode';
import { resetMotionModeForTests } from '../../../motion/test-support/reset-motion-mode';
import { Burst } from '../Burst';
import { Flip } from '../Flip';
import { Fold } from '../Fold';
import { SharedGrowHost, SharedTarget } from '../SharedGrow';
import type { Rect } from '../use-shared-source';
import {
  planUnzoom,
  planZoom,
  sharedGrowStore,
  unzoom,
  useSharedSource,
  zoomTo,
} from '../use-shared-source';

// Imported last on purpose: the testing library registers its own Reanimated mock, which cannot
// load under this app's Jest setup (jest.config.js); everything above already loaded the app's.
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

type ViewInstance = ComponentRef<typeof View>;

const CARD: Rect = { x: 20, y: 300, width: 350, height: 120 };
const DETAIL: Rect = { x: 0, y: 0, width: 390, height: 844 };
const HIDDEN = { includeHiddenElements: true };

/** Jest's native View never answers `measureInWindow`; the card's ref gets a measurable double. */
const captured: { card?: RefObject<ViewInstance | null> | undefined } = {};
function pinCardRect(rect: Rect) {
  if (!captured.card) throw new Error('card not mounted');
  captured.card.current = {
    measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(rect.x, rect.y, rect.width, rect.height),
  } as unknown as ViewInstance;
}

function Card() {
  const ref = useSharedSource('kyoto', () => <Text>kyoto clone</Text>);
  useEffect(() => {
    captured.card = ref;
  });
  return (
    <Pressable
      ref={ref}
      testID="card"
      onPress={() => void zoomTo('kyoto', '/detail', { hop: true })}
    >
      <Text>kyoto card</Text>
    </Pressable>
  );
}

function Detail() {
  return (
    <SharedTarget id="kyoto">
      <Text>kyoto detail</Text>
    </SharedTarget>
  );
}

function Root() {
  return (
    <SafeAreaProvider
      initialMetrics={{ frame: DETAIL, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <SharedGrowHost />
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function flat(element: { props: { style?: unknown } }): ViewStyle {
  return StyleSheet.flatten(element.props.style as ViewStyle) ?? {};
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

beforeEach(async () => {
  sharedGrowStore.resetForTests();
  captured.card = undefined;
  await resetMotionModeForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('zoom plan', () => {
  it('adds the 200 ms hop pre-beat for stickers only', () => {
    expect(planZoom(false)).toEqual({ delayMs: 0, durationMs: 560, totalMs: 560 });
    expect(planZoom(true)).toEqual({ delayMs: 200, durationMs: 560, totalMs: 760 });
  });

  it('unzooms into a mounted source and falls back to the fade without one', () => {
    expect(planUnzoom(CARD)).toEqual({ kind: 'unzoom', to: CARD, durationMs: 460 });
    expect(planUnzoom(undefined)).toEqual({ kind: 'unfade' });
  });
});

describe('shared grow', () => {
  async function renderApp() {
    const pending = renderRouter(
      { _layout: Root, index: Card, detail: Detail },
      { initialUrl: '/' },
    );
    await pending;
    return { getPathname: () => pending.getPathname() };
  }

  it('holds the clone over the card, grows it into the measured detail, then hands off', async () => {
    const app = await renderApp();
    pinCardRect(CARD);
    await fireEvent.press(screen.getByTestId('card'));
    await act(async () => {});
    expect(app.getPathname()).toBe('/detail');

    const [zoom] = sharedGrowStore.active;
    expect(zoom).toMatchObject({ id: 'kyoto', direction: 'in', from: CARD, to: null, hop: true });
    expect(flat(screen.getByTestId('zoom-clone-kyoto', HIDDEN))).toMatchObject({
      left: CARD.x,
      top: CARD.y,
      borderRadius: tokens.radius.cardBig,
    });
    // The detail stays hidden while the clone is in flight.
    expect(flat(screen.getByTestId('shared-target-kyoto', HIDDEN)).opacity).toBe(0);

    await act(() => {
      sharedGrowStore.reportTarget('kyoto', DETAIL);
      jest.runOnlyPendingTimers();
    });
    expect(sharedGrowStore.active).toHaveLength(0);
    expect(screen.queryByTestId('zoom-clone-kyoto', HIDDEN)).toBeNull();
    expect(flat(screen.getByTestId('shared-target-kyoto')).opacity).toBe(1);
  });

  it('grows to the full window when the destination never measures itself', async () => {
    await renderApp();
    pinCardRect(CARD);
    await fireEvent.press(screen.getByTestId('card'));
    await act(async () => {});
    expect(sharedGrowStore.active).toHaveLength(1);
    await act(() => {
      jest.advanceTimersByTime(tokens.motion.duration.base);
    });
    await act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(sharedGrowStore.active).toHaveLength(0);
  });

  it('unzooms back into the card while it is mounted', async () => {
    await renderApp();
    pinCardRect(CARD);
    const plan = await unzoom('kyoto', DETAIL);
    expect(plan).toEqual({ kind: 'unzoom', to: CARD, durationMs: 460 });
  });

  it('fades instead when the card is gone', async () => {
    const plan = await unzoom('kyoto', DETAIL);
    expect(plan).toEqual({ kind: 'unfade' });
    expect(sharedGrowStore.active).toHaveLength(0);
  });
});

async function setMotion(mode: 'reduced') {
  const probe = { set: (_: 'reduced') => {} };
  function Probe() {
    const [, setMode] = useMotionMode();
    useEffect(() => {
      probe.set = setMode;
    });
    return null;
  }
  const rendered = await render(<Probe />);
  await act(() => probe.set(mode));
  await rendered.unmount();
}

describe('Burst, Fold, Flip', () => {
  it('bursts in with a cream flash, without it under reduced motion', async () => {
    const full = await render(<Burst>{<Text>won</Text>}</Burst>);
    expect(full.getByTestId('burst-flash', HIDDEN)).toBeTruthy();
    await full.unmount();

    await setMotion('reduced');
    const reduced = await render(<Burst>{<Text>won</Text>}</Burst>);
    expect(reduced.queryByTestId('burst-flash', HIDDEN)).toBeNull();
  });

  it('folds out and reports when it has left', async () => {
    const onLeft = jest.fn();
    const screenFold = await render(<Fold onLeft={onLeft}>{<Text>draft</Text>}</Fold>);
    await screenFold.rerender(
      <Fold leaving onLeft={onLeft}>
        {<Text>draft</Text>}
      </Fold>,
    );
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('keeps only the showing face in the accessibility tree', async () => {
    const card = await render(
      <Flip front={<Text>front</Text>} back={<Text>back</Text>} flipped={false} />,
    );
    expect(card.getByText('front')).toBeTruthy();
    expect(card.queryByText('back')).toBeNull();
    await card.rerender(<Flip front={<Text>front</Text>} back={<Text>back</Text>} flipped />);
    expect(card.getByText('back')).toBeTruthy();
    expect(card.queryByText('front')).toBeNull();
  });
});
