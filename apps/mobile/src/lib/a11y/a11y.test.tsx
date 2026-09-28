import { i18n } from '@lingui/core';
import { act, render, screen } from '@testing-library/react-native';
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';

import { ThemeProvider } from '@/lib/theme';

import { announce } from './announce';
import { focusItem, groupedSummary, readingOrder } from './focus-order';
import { critterLabel, DECORATIVE, guideLabel, lockedCritterLabel } from './labels';
import { largeContent } from './large-content';
import { announceChange, liveRegion } from './live-region';
import { fontScaleInfo, useFontScale } from './use-font-scale';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

afterEach(() => {
  // jest-expo's AccessibilityInfo methods are already mocks, so calls are cleared, not restored.
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('spoken labels', () => {
  it('names critters, guides and locked locals the way the design system words them', () => {
    expect(critterLabel('Tokek', 'temple')).toBe('Tokek, temple form');
    expect(guideLabel('Tokek', 'waving')).toBe('Tokek, waving');
    expect(lockedCritterLabel('Kyoto')).toBe('Undiscovered local, found by being in Kyoto');
  });

  it('hides decorative art from both screen readers', async () => {
    await render(
      <View testID="art" {...DECORATIVE}>
        <Text>flourish</Text>
      </View>,
    );
    expect(screen.queryByText('flourish')).toBeNull();
    expect(screen.getByTestId('art', { includeHiddenElements: true }).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('announcements', () => {
  it('interrupts by default and queues when asked', () => {
    const now = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockReturnValue();
    const queued = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockReturnValue();
    announce('SOS sent');
    announce('Draft ready', { queue: true });
    announce('');
    expect(now).toHaveBeenCalledWith('SOS sent');
    expect(queued).toHaveBeenCalledWith('Draft ready', { queue: true });
    expect(now).toHaveBeenCalledTimes(1);
  });

  it('uses a live region on Android and an announcement on iOS', () => {
    const queued = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockReturnValue();
    const now = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockReturnValue();

    expect(liveRegion('assertive')).toEqual({});
    announceChange('3 new messages');
    announceChange('Connection lost', 'assertive');
    expect(queued).toHaveBeenCalledWith('3 new messages', { queue: true });
    expect(now).toHaveBeenCalledWith('Connection lost');

    jest.replaceProperty(Platform, 'OS', 'android');
    expect(liveRegion()).toEqual({ accessibilityLiveRegion: 'polite' });
    announceChange('4 new messages');
    expect(queued.mock.calls).toEqual([['3 new messages', { queue: true }]]);
  });
});

describe('focus order', () => {
  it('lists the children a composite reads, in reading order, and groups summaries', () => {
    expect(readingOrder(['route', 'seat', 'gate'])).toEqual({
      experimental_accessibilityOrder: ['route', 'seat', 'gate'],
    });
    expect(focusItem('seat')).toEqual({ nativeID: 'seat' });
    expect(groupedSummary('Bali stamp, 12 May')).toEqual({
      accessible: true,
      accessibilityLabel: 'Bali stamp, 12 May',
    });
  });
});

describe('large text', () => {
  it('shows the large content viewer only while the visible label is hidden', () => {
    expect(largeContent('Wallet', true)).toEqual({
      accessibilityShowsLargeContentViewer: true,
      accessibilityLargeContentTitle: 'Wallet',
    });
    expect(largeContent('Wallet', false).accessibilityShowsLargeContentViewer).toBe(false);
  });

  it('classifies font scales from default up to the AX3 ceiling', () => {
    expect(fontScaleInfo(1)).toEqual({ scale: 1, isLarge: false, isMax: false });
    expect(fontScaleInfo(1.5)).toEqual({ scale: 1.5, isLarge: true, isMax: false });
    expect(fontScaleInfo(2)).toEqual({ scale: 2, isLarge: true, isMax: true });
  });

  it('reads the scale from the nearest theme provider', async () => {
    function Probe() {
      const { scale, isMax } = useFontScale();
      return <Text>{`${String(scale)} ${String(isMax)}`}</Text>;
    }
    await render(
      <ThemeProvider fontScale={3}>
        <Probe />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('2 true')).toBeTruthy();
  });
});
