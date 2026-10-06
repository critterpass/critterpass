import { act, fireEvent, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { IslandToast, LEAVE_MS } from '../IslandToast';
import type { ToastTextProps } from '../IslandToast';
import { HEADER_CLEARANCE_PT, hasDynamicIsland, ISLAND_GAP_PT, toastPlacement } from '../placement';
import { toastQueue, useToastQueue } from '../queue';

const bannerMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const islandMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/** Motion sits below the component library; the app root passes the library `Text`. */
function ToastText({ variant, ...props }: ToastTextProps) {
  return <Text {...props} testID={`toast-text-${variant}`} />;
}

async function renderToast(initialMetrics: Metrics = bannerMetrics) {
  return renderWithI18n(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <IslandToast Text={ToastText} />
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  toastQueue.resetForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('toastQueue', () => {
  it('shows one toast at a time, draining the queue after the visible one dismisses', async () => {
    const { result } = await renderHook(() => useToastQueue());
    expect(result.current).toBeNull();

    await act(() => {
      toastQueue.show({ id: 'a', title: 'First' });
      toastQueue.show({ id: 'b', title: 'Second' });
    });

    expect(result.current?.id).toBe('a');

    await act(() => {
      jest.advanceTimersByTime(2800);
    });
    expect(result.current?.id).toBe('b');
  });

  it('de-dupes a request already current or queued', async () => {
    const { result } = await renderHook(() => useToastQueue());

    await act(() => {
      toastQueue.show({ id: 'a', title: 'First' });
      toastQueue.show({ id: 'a', title: 'First (again)' });
    });

    expect(result.current?.title).toBe('First');
  });

  it('extends the duration to 6 s when an action is present', async () => {
    const { result } = await renderHook(() => useToastQueue());

    await act(() => {
      toastQueue.show({ id: 'a', title: 'First', action: { label: 'Open', onPress: jest.fn() } });
    });

    await act(() => {
      jest.advanceTimersByTime(2800);
    });
    expect(result.current?.id).toBe('a');

    await act(() => {
      jest.advanceTimersByTime(3200);
    });
    expect(result.current).toBeNull();
  });

  it('dismiss() clears the current toast immediately', async () => {
    const { result } = await renderHook(() => useToastQueue());

    await act(() => {
      toastQueue.show({ id: 'a', title: 'First' });
    });
    expect(result.current?.id).toBe('a');

    await act(() => {
      toastQueue.dismiss();
    });
    expect(result.current).toBeNull();
  });
});

describe('hasDynamicIsland', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('is true on iOS once the top inset reaches a Dynamic Island phone (14 Pro+)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    expect(hasDynamicIsland(59)).toBe(true);
    expect(hasDynamicIsland(47)).toBe(false);
  });

  it('is always false on Android regardless of inset', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    expect(hasDynamicIsland(59)).toBe(false);
  });
});

describe('toastPlacement', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  const sides = { left: 0, right: 0 };

  it('rests just below the island and never starts above the safe-area edge', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    for (const top of [59, 62]) {
      const placement = toastPlacement({ top, ...sides });
      expect(placement.top).toBe(top + ISLAND_GAP_PT);
      expect(placement.top - placement.travel).toBe(top);
    }
  });

  it('drops below the header controls on a notch phone, starting at the safe-area edge', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const placement = toastPlacement({ top: 47, ...sides });
    expect(placement.top).toBe(47 + HEADER_CLEARANCE_PT);
    expect(placement.top - placement.travel).toBe(47);
  });

  it('clears the Android status bar and a tall cutout, whatever the inset', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    for (const top of [0, 24, 59, 96]) {
      const placement = toastPlacement({ top, ...sides });
      expect(placement.top).toBe(top + HEADER_CLEARANCE_PT);
      expect(placement.top - placement.travel).toBe(top);
    }
  });

  it('keeps clear of side cutouts', () => {
    const flat = toastPlacement({ top: 47, ...sides });
    const cut = toastPlacement({ top: 47, left: 44, right: 21 });
    expect(cut.left - flat.left).toBe(44);
    expect(cut.right - flat.right).toBe(21);
  });
});

describe('IslandToast', () => {
  it('keeps Open and Dismiss beside the alert, so a folded Android alert node leaves them reachable', async () => {
    await act(() => {
      toastQueue.show({
        id: 'a',
        title: 'Pass issued',
        action: { label: 'Open', onPress: jest.fn() },
      });
    });
    const { getByTestId } = await renderToast();

    const message = await waitFor(() => getByTestId('island-toast-message'));
    expect(message.props.accessibilityRole).toBe('alert');
    for (const id of ['island-toast-open', 'island-toast-dismiss']) {
      const button = getByTestId(id);
      let node = button.parent;
      while (node && node !== message) node = node.parent;
      expect(node).toBeNull();
      expect(button.props.accessibilityRole).toBe('button');
    }
  });

  it('offers Open and Dismiss as screen-reader actions on the alert', async () => {
    const onPress = jest.fn();
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued', action: { label: 'Open', onPress } });
    });
    const { getByTestId } = await renderToast();

    const message = await waitFor(() => getByTestId('island-toast-message'));
    expect(message.props.accessibilityActions).toEqual([
      { name: 'open', label: 'Open' },
      { name: 'dismiss', label: 'Dismiss' },
    ]);
    await fireEvent(message, 'accessibilityAction', { nativeEvent: { actionName: 'open' } });
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(message, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    expect(toastQueue.getCurrent()).toBeNull();
  });

  it('offers only Dismiss when the toast has no action', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued' });
    });
    const { getByTestId, queryByTestId } = await renderToast();

    const message = await waitFor(() => getByTestId('island-toast-message'));
    expect(message.props.accessibilityActions).toEqual([{ name: 'dismiss', label: 'Dismiss' }]);
    expect(queryByTestId('island-toast-open')).toBeNull();
  });

  it('announces the toast for screen readers', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued', subtitle: 'Tap to view' });
    });
    await renderToast();

    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('Pass issued. Tap to view'));
  });

  it.each([
    ['a Dynamic Island phone', islandMetrics],
    ['a phone without an island', bannerMetrics],
  ])('sits where the placement says on %s', async (_name, metrics) => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued' });
    });
    const screen = await renderToast(metrics);

    const pill = await waitFor(() => screen.getByTestId('island-toast-pill'));
    const host = StyleSheet.flatten(pill.parent?.props.style as StyleProp<ViewStyle>);
    const placement = toastPlacement(metrics.insets);
    expect(host?.top).toBe(placement.top);
    expect(host?.top).toBeGreaterThan(metrics.insets.top);
    expect(host?.left).toBe(placement.left);
    expect(host?.right).toBe(placement.right);
  });

  it('the dismiss action clears the current toast', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued' });
    });
    const { getByLabelText } = await renderToast();

    await waitFor(() => expect(getByLabelText('Dismiss')).toBeTruthy());
    await act(() => {
      fireGestureHandler(getByGestureTestId('island-toast-dismiss-tap'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
      jest.advanceTimersByTime(20);
    });
    expect(toastQueue.getCurrent()).toBeNull();
  });

  it('runs its action from a tap on the action, and from the screen reader', async () => {
    const onPress = jest.fn();
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Moved', action: { label: 'UNDO', onPress } });
    });
    const screen = await renderToast();
    await waitFor(() => expect(screen.getByLabelText('UNDO')).toBeTruthy());
    await act(() => {
      fireGestureHandler(getByGestureTestId('island-toast-open-tap'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
      jest.advanceTimersByTime(20);
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(screen.getByLabelText('UNDO'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('claims every touch on the pill, alongside its own buttons, so nothing under it fires', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Moved', action: { label: 'UNDO', onPress: () => {} } });
    });
    await renderToast();
    const claim = getByGestureTestId('island-toast-claim') as unknown as {
      handlerName: string;
      handlers: { onTouchesDown?: unknown };
      config: { simultaneousWith?: readonly unknown[] };
    };
    // A manual gesture that activates on touch-down: it cancels any gesture under the pill.
    expect(claim.handlerName).toBe('ManualGestureHandler');
    expect(claim.handlers.onTouchesDown).toBeDefined();
    expect(claim.config.simultaneousWith).toEqual(
      expect.arrayContaining([
        getByGestureTestId('island-toast-open-tap'),
        getByGestureTestId('island-toast-dismiss-tap'),
      ]),
    );
    for (const id of ['island-toast-open-tap', 'island-toast-dismiss-tap']) {
      const tap = getByGestureTestId(id) as unknown as {
        config: { simultaneousWith?: readonly unknown[] };
      };
      expect(tap.config.simultaneousWith).toContain(claim);
    }
  });

  it('stays on screen, still taking its touches, while it leaves', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Moved', action: { label: 'UNDO', onPress: () => {} } });
    });
    const screen = await renderToast();
    await waitFor(() => expect(screen.getByTestId('island-toast-pill')).toBeTruthy());
    await act(() => {
      toastQueue.dismiss();
    });
    // Dismissed, but the pill is still there, leaving.
    expect(screen.queryByTestId('island-toast-pill')).not.toBeNull();
    await act(() => {
      jest.advanceTimersByTime(LEAVE_MS + 50);
    });
    await waitFor(() => expect(screen.queryByTestId('island-toast-pill')).toBeNull());
  });
});
