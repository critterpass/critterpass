import { act, fireEvent, renderHook, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { hasDynamicIsland, IslandToast } from '../IslandToast';
import { toastQueue, useToastQueue } from '../queue';

const bannerMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const islandMetrics: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

async function renderToast(initialMetrics: Metrics = bannerMetrics) {
  return renderWithI18n(
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <IslandToast />
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

describe('IslandToast', () => {
  it('renders nothing when the queue is empty', async () => {
    const { queryByText } = await renderToast();
    expect(queryByText('First')).toBeNull();
  });

  it('renders the current toast with its title, subtitle and action', async () => {
    const onPress = jest.fn();
    await act(() => {
      toastQueue.show({
        id: 'a',
        title: 'Pass issued',
        subtitle: 'Tap to view',
        action: { label: 'Open', onPress },
      });
    });
    const { getByText } = await renderToast();

    await waitFor(() => expect(getByText('Pass issued')).toBeTruthy());
    expect(getByText('Tap to view')).toBeTruthy();
    await fireEvent.press(getByText('Open'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces the toast for screen readers', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued', subtitle: 'Tap to view' });
    });
    await renderToast();

    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith('Pass issued. Tap to view'));
  });

  it('renders a caller-provided sticker node', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Egg hatched', sticker: <Text>🥚</Text> });
    });
    const { getByText } = await renderToast();

    await waitFor(() => expect(getByText('🥚')).toBeTruthy());
  });

  it('renders without crashing under Dynamic Island safe-area metrics', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued' });
    });
    const { toJSON } = await renderToast(islandMetrics);
    await waitFor(() => expect(toJSON()).toBeTruthy());
  });

  it('the dismiss action clears the current toast', async () => {
    await act(() => {
      toastQueue.show({ id: 'a', title: 'Pass issued' });
    });
    const { getByLabelText } = await renderToast();

    await waitFor(() => expect(getByLabelText('Dismiss')).toBeTruthy());
    await fireEvent.press(getByLabelText('Dismiss'));
    expect(toastQueue.getCurrent()).toBeNull();
  });
});
