import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '../../../test-support/render';
import { Lightbox } from '../Lightbox';
import type { LightboxItem } from '../lightbox-model';
import { zoomPageGestures } from '../zoom-page';

const ITEMS: readonly LightboxItem[] = [
  { key: 'a', kind: 'image', uri: 'https://img.test/a.jpg', credit: 'Linh Tran · Unsplash' },
  { key: 'b', kind: 'image', uri: 'https://img.test/b.jpg', caption: 'Dragon Bridge at night' },
  { key: 'c', kind: 'image', uri: null, credit: 'Foursquare' },
];

const METRICS = {
  frame: { x: 0, y: 0, width: 750, height: 1334 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};
const show = (viewer: ReactElement) =>
  renderUi(<SafeAreaProvider initialMetrics={METRICS}>{viewer}</SafeAreaProvider>);

const scrollTo = (page: number, width: number) =>
  fireEvent.scroll(screen.getByTestId('lightbox-pager'), {
    nativeEvent: {
      contentOffset: { x: page * width, y: 0 },
      contentSize: { width: width * ITEMS.length, height: 800 },
      layoutMeasurement: { width, height: 800 },
    },
  });

describe('the full-screen viewer', () => {
  it('opens on the item tapped with its place in the set and its credit', async () => {
    await show(<Lightbox items={ITEMS} initialIndex={0} onClose={() => {}} />);
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('1 / 3');
    expect(screen.getByTestId('lightbox-credit')).toHaveTextContent('Linh Tran · Unsplash');
    expect(screen.queryByTestId('lightbox-caption')).toBeNull();
  });

  it('follows the pager: the counter, the caption and the credit are the page on screen', async () => {
    await show(<Lightbox items={ITEMS} initialIndex={0} onClose={() => {}} />);
    await scrollTo(1, 750);
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('2 / 3');
    expect(screen.getByTestId('lightbox-caption')).toHaveTextContent('Dragon Bridge at night');
    expect(screen.queryByTestId('lightbox-credit')).toBeNull();
    await scrollTo(2, 750);
    expect(screen.getByTestId('lightbox-counter')).toHaveTextContent('3 / 3');
    expect(screen.getByTestId('lightbox-credit')).toHaveTextContent('Foursquare');
  });

  it('shows no counter for a single item and closes from ✕', async () => {
    const onClose = jest.fn();
    await show(<Lightbox items={ITEMS.slice(0, 1)} onClose={onClose} />);
    expect(screen.queryByTestId('lightbox-counter')).toBeNull();
    await fireEvent.press(screen.getByTestId('lightbox-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries one gesture per view, the pinch running with the zoomed drag', () => {
    const drag = Gesture.Pan();
    const set = zoomPageGestures(Gesture.Pinch(), drag, Gesture.Tap());
    for (const gesture of Object.values(set)) expect(gesture.toGestureArray()).toHaveLength(1);
    expect(set.pinchArea.config.simultaneousWith).toContain(drag);
  });
});
