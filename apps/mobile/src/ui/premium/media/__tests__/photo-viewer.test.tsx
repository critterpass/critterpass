// The shared Reanimated stand-in has no `ReduceMotion`, which the premium springs read at import.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderWithI18n } from '@/lib/i18n/testing';
import type { LightboxItem } from '@/lib/media/viewer/lightbox-model';
import { PremiumThemeProvider } from '@/ui/premium';

import { PhotoViewer } from '../photo-viewer';

const ITEMS: readonly LightboxItem[] = [
  { key: 'a', kind: 'image', uri: 'https://img.test/a.jpg', credit: 'Linh Tran · Unsplash' },
  { key: 'b', kind: 'image', uri: 'https://img.test/b.jpg', caption: 'Dragon Bridge at night' },
  { key: 'c', kind: 'image', uri: null, credit: 'Foursquare' },
];

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const show = (viewer: ReactElement) =>
  renderWithI18n(
    <SafeAreaProvider initialMetrics={METRICS}>
      <GestureHandlerRootView>
        <PremiumThemeProvider>{viewer}</PremiumThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
    { locale: 'en' },
  );

const turn = (actionName: 'increment' | 'decrement') =>
  fireEvent(screen.getByTestId('photo-viewer-position'), 'accessibilityAction', {
    nativeEvent: { actionName },
  });

const drag = async (translationX: number, translationY: number) => {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('photo-viewer-pan'), [
      { state: State.BEGAN, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX, translationY },
      { state: State.END, translationX, translationY, velocityX: 0, velocityY: 0 },
    ]);
    await Promise.resolve();
  });
};

describe('the premium photo viewer', () => {
  it('shows the page on screen: its place in the set, its caption and its credit', async () => {
    await show(<PhotoViewer items={ITEMS} closeLabel="Close" onClose={() => {}} />);
    expect(screen.getByTestId('photo-viewer-counter')).toHaveTextContent('1 / 3');
    expect(screen.getByTestId('photo-viewer-credit')).toHaveTextContent('Linh Tran · Unsplash');
    await turn('increment');
    expect(screen.getByTestId('photo-viewer-counter')).toHaveTextContent('2 / 3');
    expect(screen.getByTestId('photo-viewer-caption')).toHaveTextContent('Dragon Bridge at night');
    await turn('increment');
    await turn('increment');
    expect(screen.getByTestId('photo-viewer-counter')).toHaveTextContent('3 / 3');
  });

  it('turns the page on a sideways drag and closes on a drag down or ✕', async () => {
    const onClose = jest.fn();
    await show(<PhotoViewer items={ITEMS} closeLabel="Close" onClose={onClose} />);
    await drag(-300, 6);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('photo-viewer-counter')).toHaveTextContent('2 / 3');
    await drag(4, 400);
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('photo-viewer-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows no counter for one photo', async () => {
    await show(<PhotoViewer items={ITEMS.slice(0, 1)} closeLabel="Close" onClose={() => {}} />);
    expect(screen.queryByTestId('photo-viewer-counter')).toBeNull();
  });
});
