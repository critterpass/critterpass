import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, fireEvent, render, renderHook, within } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { cloneElement } from 'react';
import type { ContextType, ReactElement } from 'react';
import { BackHandler, StyleSheet, Text } from 'react-native';
import type { ViewStyle } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../../lib/theme';
import { focusedBackAffordances } from '../../qa/back-affordance';
import { UI_QA_ENABLED } from '../../qa/ui-qa';
import { ScreenJoltProvider } from '../../../motion/patterns/thud';
import { resetMotionModeForTests } from '../../../motion/test-support/reset-motion-mode';
import { useMotionMode } from '../../../motion/motion-mode';
import { Scaffold } from '../../surface/Scaffold';
import { presenterProgress, resetPresenterForTests } from '../presenter';
import { RiseModal } from '../RiseModal';
import { detentHeights, fitContentShrinks, Sheet, sheetFootClearance } from '../Sheet';
import { SheetScrollView } from '../SheetScrollView';
import { resolveRelease } from '../use-modal-presentation';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function tree(ui: ReactElement) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <I18nProvider i18n={i18n}>
          <ThemeProvider>
            <ScreenJoltProvider>{ui}</ScreenJoltProvider>
          </ThemeProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Renders, then renders once more: under Jest's Reanimated double an animation lands instantly but
 * an animated style is only read during render, so the second pass shows the post-entrance frame.
 */
async function renderModal(ui: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const screen = await render(tree(ui));
  // A cloned element (fresh props object) so React re-renders the modal instead of bailing out.
  const refresh = () => screen.rerender(tree(cloneElement(ui)));
  await refresh();
  return Object.assign(screen, { refresh });
}

/** Decorative/a11y-hidden nodes (the scrim) need this to be queryable. */
const HIDDEN = { includeHiddenElements: true };

function flat(element: { props: { style?: unknown } }): ViewStyle {
  return StyleSheet.flatten(element.props.style as ViewStyle) ?? {};
}

function translateY(style: ViewStyle): number {
  const transforms = (style.transform ?? []) as { translateY?: number }[];
  return transforms.find((entry) => entry.translateY !== undefined)?.translateY ?? 0;
}

async function drag(testId: string, startY: number, dy: number, velocityY = 0) {
  await act(() => {
    fireGestureHandler(getByGestureTestId(testId), [
      { state: State.BEGAN, y: startY, translationY: 0 },
      { state: State.ACTIVE, y: startY, translationY: 0 },
      { state: State.ACTIVE, y: startY + dy / 2, translationY: dy / 2 },
      { state: State.ACTIVE, y: startY + dy, translationY: dy },
      { state: State.END, y: startY + dy, translationY: dy, velocityY },
    ]);
  });
}

// Every constant below is docs/design-system.md §3.3's drag-dismiss rule: commit dy > 150 or
// v > .55 pt/ms, grab zone top 110 (sheet) / 160 (rise).
describe('resolveRelease', () => {
  it('dismisses from the lowest detent past the distance or velocity commit', () => {
    expect(resolveRelease(1, 0, 151, 0)).toEqual({ kind: 'dismiss' });
    expect(resolveRelease(1, 0, 20, 0.56)).toEqual({ kind: 'dismiss' });
  });

  it('drops one detent instead of dismissing from a higher one', () => {
    expect(resolveRelease(2, 1, 200, 0)).toEqual({ kind: 'snap', index: 0 });
  });

  it('raises one detent on an upward commit and springs back otherwise', () => {
    expect(resolveRelease(2, 0, -160, 0)).toEqual({ kind: 'snap', index: 1 });
    expect(resolveRelease(2, 0, 100, 0.2)).toEqual({ kind: 'snap', index: 0 });
    expect(resolveRelease(2, 1, -300, 0)).toEqual({ kind: 'snap', index: 1 });
  });
});

describe('detentHeights', () => {
  it('maps large to .87 and medium to half the screen, ascending', () => {
    expect(detentHeights(['large', 'medium'], 800, null)).toEqual([400, 696]);
  });

  it('clamps fit to large and drops duplicates', () => {
    expect(detentHeights(['fit'], 800, 1200)).toEqual([696]);
    expect(detentHeights(['fit', 'medium'], 800, 400)).toEqual([400]);
  });
});

describe('fitContentShrinks', () => {
  it('lets fit content shrink only once it has reached the large detent', () => {
    expect(fitContentShrinks(1200, 800)).toBe(true);
    expect(fitContentShrinks(696, 800)).toBe(true);
    // Measured while shrunk, a fraction under large after layout rounding: it stays shrinking.
    expect(fitContentShrinks(695.5, 800)).toBe(true);
  });

  it('keeps shorter or unmeasured content at its natural height, so it can still grow the sheet', () => {
    expect(fitContentShrinks(400, 800)).toBe(false);
    expect(fitContentShrinks(null, 800)).toBe(false);
  });
});

/** A screen that was up before its sheet opened: the sheet's presenter. */
function ScreenUnderSheet() {
  return (
    <>
      <Scaffold testID="presenter" />
      <Sheet onDismiss={() => {}} accessibilityLabel="Place">
        <Text>body</Text>
      </Sheet>
    </>
  );
}

describe('Sheet', () => {
  beforeEach(async () => {
    resetPresenterForTests();
    await resetMotionModeForTests();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rises to its detent and scales the presenter to .93', async () => {
    const screen = await renderModal(<ScreenUnderSheet />);
    expect(screen.getByText('body')).toBeTruthy();
    expect(translateY(flat(screen.getByTestId('sheet-panel')))).toBe(0);
    expect(presenterProgress.value).toBe(1);
    expect(flat(screen.getByTestId('presenter')).transform).toEqual([{ scale: 0.93 }]);
  });

  it('keeps a screen opened over the sheet full size', async () => {
    await renderModal(
      <Sheet onDismiss={() => {}}>
        <Text>crews</Text>
      </Sheet>,
    );
    expect(presenterProgress.value).toBe(1);
    // A page pushed from the open sheet (start a crew, join with a code) mounts above it.
    const page = await renderModal(<Scaffold testID="page" />);
    expect(flat(page.getByTestId('page')).transform).toBeUndefined();
  });

  it('keeps a screen that renders its own sheet full size, so the sheet stays edge to edge', async () => {
    const screen = await renderModal(
      <Scaffold testID="chat">
        <Sheet onDismiss={() => {}}>
          <Text>attach</Text>
        </Sheet>
      </Scaffold>,
    );
    expect(presenterProgress.value).toBe(1);
    expect(flat(screen.getByTestId('chat')).transform).toBeUndefined();
  });

  it('lays a header and the ✕ out in one row, so a trailing action never sits under the ✕', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <Sheet onDismiss={onDismiss} header={<Text>Your crews</Text>}>
        <Text>body</Text>
      </Sheet>,
    );
    const row = screen.getByTestId('sheet-header');
    const close = screen.getByTestId('sheet-close');
    expect(flat(row)).toMatchObject({ flexDirection: 'row', alignItems: 'center' });
    expect(within(row).getByTestId('sheet-close')).toBeTruthy();
    expect(flat(close).position).toBeUndefined();
    expect(screen.getByText('Your crews')).toBeTruthy();
    await fireEvent.press(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('heads with a title that wraps rather than cuts, beside its action and the ✕', async () => {
    const screen = await renderModal(
      <Sheet
        onDismiss={() => {}}
        title="Your crews"
        headerEnd={<Text testID="join">Join with a code</Text>}
      >
        <Text>body</Text>
      </Sheet>,
    );
    const row = screen.getByTestId('sheet-header');
    expect(flat(row)).toMatchObject({ flexDirection: 'row', alignItems: 'flex-start' });
    const title = within(row).getByRole('header');
    expect(title.props.numberOfLines).toBeUndefined();
    expect(within(row).getByTestId('join')).toBeTruthy();
    expect(within(row).getByTestId('sheet-close')).toBeTruthy();
  });

  it('hides the ✕ on a sheet the grabber dismisses', async () => {
    const titled = await renderModal(
      <Sheet onDismiss={() => {}} title="Your crews" closable={false}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(titled.queryByTestId('sheet-close')).toBeNull();
    await act(() => titled.unmount());
    const bare = await renderModal(
      <Sheet onDismiss={() => {}} closable={false}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(bare.queryByTestId('sheet-close')).toBeNull();
    // Without a ✕ the drag down and the scrim still take it back: it counts as the way back.
    expect(focusedBackAffordances()).toBe(UI_QA_ENABLED ? 1 : 0);
    await act(() => bare.unmount());
    expect(focusedBackAffordances()).toBe(0);
  });

  it('keeps the ✕ floating at the corner when there is no header', async () => {
    const screen = await renderModal(
      <Sheet onDismiss={() => {}}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet-header')).toBeNull();
    expect(flat(screen.getByTestId('sheet-close')).position).toBe('absolute');
  });

  it('releases the presenter when it unmounts without being dismissed', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <Sheet onDismiss={onDismiss}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(presenterProgress.value).toBe(1);
    await act(() => screen.unmount());
    expect(presenterProgress.value).toBe(0);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses from the mandatory ✕, the scrim and the escape gesture', async () => {
    for (const trigger of ['close', 'scrim', 'escape'] as const) {
      resetPresenterForTests();
      const onDismiss = jest.fn<() => void>();
      const screen = await renderModal(
        <Sheet onDismiss={onDismiss}>
          <Text>body</Text>
        </Sheet>,
      );
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
      if (trigger === 'close') await fireEvent.press(screen.getByTestId('sheet-close'));
      if (trigger === 'scrim') await fireEvent.press(screen.getByTestId('sheet-scrim', HIDDEN));
      if (trigger === 'escape')
        await fireEvent(screen.getByTestId('sheet-panel'), 'accessibilityEscape');
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(presenterProgress.value).toBe(0);
      await act(() => screen.unmount());
    }
  });

  it('keeps the presenter while another sheet is up and releases it with the last one', async () => {
    resetPresenterForTests();
    const sheet = (id: string) => (
      <Sheet key={id} onDismiss={() => {}} testID={id}>
        <Text>{id}</Text>
      </Sheet>
    );
    const screen = await render(tree(<>{[sheet('photo'), sheet('country')]}</>));
    expect(presenterProgress.value).toBe(1);
    // A DONE that clears the state showing the sheet: the other one still holds the presenter.
    await screen.rerender(tree(<>{[sheet('country')]}</>));
    expect(presenterProgress.value).toBe(1);
    await screen.rerender(tree(<></>));
    expect(presenterProgress.value).toBe(0);
    const presenter = await renderModal(<Scaffold testID="presenter" />);
    expect(flat(presenter.getByTestId('presenter')).transform).toEqual([{ scale: 1 }]);
  });

  it('closes on Android system back', async () => {
    const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => {} };
    });
    const onDismiss = jest.fn<() => void>();
    await renderModal(
      <Sheet onDismiss={onDismiss}>
        <Text>body</Text>
      </Sheet>,
    );
    let consumed: boolean | null | undefined = false;
    await act(() => {
      consumed = handlers[handlers.length - 1]?.({} as never);
    });
    expect(consumed).toBe(true);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves Android back to a page pushed over its screen', async () => {
    const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.push(handler);
      return { remove: () => {} };
    });
    const onDismiss = jest.fn<() => void>();
    // The search sheet's screen, with the place page pushed over it: no longer focused.
    const covered = {
      isFocused: () => false,
      getState: () => ({ type: 'stack' }),
      getParent: () => undefined,
      addListener: () => () => undefined,
    } as unknown as ContextType<typeof NavigationContext>;
    await renderModal(
      <NavigationContext.Provider value={covered}>
        <Sheet onDismiss={onDismiss}>
          <Text>search</Text>
        </Sheet>
      </NavigationContext.Provider>,
    );
    let consumed: boolean | null | undefined = true;
    await act(() => {
      consumed = handlers[handlers.length - 1]?.({} as never);
    });
    expect(consumed).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('commits a drag from the grab zone past 150 pt and cancels a short one', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <Sheet onDismiss={onDismiss} testID="commit">
        <Text>body</Text>
      </Sheet>,
    );
    await drag('commit-drag', 40, 100, 100);
    expect(onDismiss).not.toHaveBeenCalled();
    await screen.refresh();
    expect(translateY(flat(screen.getByTestId('commit-panel')))).toBe(0);

    await drag('commit-drag', 40, 180);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('commits on a fast flick even when short', async () => {
    const onDismiss = jest.fn<() => void>();
    await renderModal(
      <Sheet onDismiss={onDismiss} testID="flick">
        <Text>body</Text>
      </Sheet>,
    );
    await drag('flick-drag', 40, 60, 700);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores drags that start below the grab zone while content is scrolled', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <Sheet onDismiss={onDismiss} testID="nested">
        <SheetScrollView testID="content">
          <Text>long</Text>
        </SheetScrollView>
      </Sheet>,
    );
    await fireEvent.scroll(screen.getByTestId('content'), {
      nativeEvent: { contentOffset: { x: 0, y: 120 } },
    });
    await drag('nested-drag', 400, 300);
    expect(onDismiss).not.toHaveBeenCalled();

    await fireEvent.scroll(screen.getByTestId('content'), {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    // Hand-off measures from the frame the content reached the top (half-way through this drag).
    await drag('nested-drag', 400, 400);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('snaps between detents', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <Sheet
        detents={['medium', 'large']}
        initialDetent="large"
        onDismiss={onDismiss}
        testID="detents"
      >
        <Text>body</Text>
      </Sheet>,
    );
    const [medium = 0, large = 0] = detentHeights(['medium', 'large'], 1334, null);
    expect(translateY(flat(screen.getByTestId('detents-panel')))).toBe(0);

    await drag('detents-drag', 40, 200);
    expect(onDismiss).not.toHaveBeenCalled();
    await screen.refresh();
    expect(translateY(flat(screen.getByTestId('detents-panel')))).toBeCloseTo(large - medium, 5);

    await drag('detents-drag', 40, -200);
    await screen.refresh();
    expect(translateY(flat(screen.getByTestId('detents-panel')))).toBe(0);
  });

  it('cross-fades without moving the presenter under reduced motion', async () => {
    const { result, unmount } = await renderHook(() => useMotionMode());
    await act(() => {
      result.current[1]('reduced');
    });
    await unmount();
    const screen = await renderModal(
      <Sheet onDismiss={() => {}}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(flat(screen.getByTestId('sheet-panel')).opacity).toBeDefined();
    expect(presenterProgress.value).toBe(0);
  });
});

describe('RiseModal', () => {
  beforeEach(async () => {
    resetPresenterForTests();
    await resetMotionModeForTests();
  });

  it('fills the screen, keeps its own content unscaled and dismisses from ✕', async () => {
    const onDismiss = jest.fn<() => void>();
    const screen = await renderModal(
      <RiseModal onDismiss={onDismiss} variant="paper">
        <Text>paywall</Text>
      </RiseModal>,
    );
    expect(screen.getByText('paywall')).toBeTruthy();
    expect(presenterProgress.value).toBe(1);
    await fireEvent.press(screen.getByTestId('rise-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('uses the taller 160 pt grab zone', async () => {
    const onDismiss = jest.fn<() => void>();
    await renderModal(
      <RiseModal onDismiss={onDismiss} testID="story">
        <Text>story</Text>
      </RiseModal>,
    );
    await drag('story-drag', 150, 200);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('the room a sheet keeps at its foot', () => {
  it('is the home indicator while the keyboard is down', () => {
    expect(sheetFootClearance('ios', 34, 0)).toBe(34);
    expect(sheetFootClearance('android', 24, 0)).toBe(24);
  });

  it('is the keyboard on iPhone, whose height counts from the bottom of the screen', () => {
    expect(sheetFootClearance('ios', 34, 336)).toBe(336);
  });

  it('adds the navigation bar on Android, whose keyboard height counts from the top of the bar', () => {
    expect(sheetFootClearance('android', 24, 290)).toBe(314);
    expect(sheetFootClearance('android', 0, 290)).toBe(290);
  });
});
