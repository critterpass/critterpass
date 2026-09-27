// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { act, fireEvent, screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, View } from 'react-native';

import { fixturesFor, listComponents } from '../gallery/registry';
import { ChecklistProgress } from '../states/ChecklistProgress';
import { ConfirmSheet } from '../states/ConfirmSheet';
import { EmptyState } from '../states/EmptyState';
import { ErrorSheet } from '../states/ErrorSheet';
import { LimitMeter } from '../states/LimitMeter';
import { LockedTeaser } from '../states/LockedTeaser';
import { OfflinePill } from '../states/OfflinePill';
import { OutboxList } from '../states/OutboxList';
import { PendingSync } from '../states/PendingSync';
import { PermissionCard } from '../states/PermissionCard';
import { Skeleton, SLOW_LOADING_MS } from '../states/Skeleton';
import { relativeAge, StaleCaption } from '../states/StaleCaption';
import { renderUi } from '../test-support/render';

import '../states/states.fixtures';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

afterEach(() => {
  jest.useRealTimers();
});

describe('state components', () => {
  it('gives an empty list a title, the guide voice and one action', async () => {
    const onPress = jest.fn();
    await renderUi(
      <EmptyState
        guide="tokek"
        guideName="Tokek"
        title="No trips yet"
        line="Want me to find something?"
        action={{ label: 'Start a trip', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'NO TRIPS YET' })).toBeTruthy();
    expect(screen.getByLabelText('Tokek: Want me to find something?')).toBeTruthy();
    await activate(screen.getByRole('button', { name: 'Start a trip' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('shows a busy hatch skeleton and a hint once loading is slow', async () => {
    jest.useFakeTimers();
    await renderUi(<Skeleton label="Loading trips" slowHint={<View testID="hint" />} />);
    const bar = screen.getByRole('progressbar', { name: 'Loading trips' });
    expect(bar.props.accessibilityState).toEqual({ busy: true });
    expect(screen.getAllByTestId('texture-hatch', { includeHiddenElements: true }).length).toBe(3);
    expect(screen.queryByTestId('hint')).toBeNull();
    await act(() => jest.advanceTimersByTime(SLOW_LOADING_MS));
    expect(screen.getByTestId('hint')).toBeTruthy();
  });

  it('offers three ways forward from an error', async () => {
    const primary = jest.fn();
    const alternative = jest.fn();
    const back = jest.fn();
    await renderUi(
      <ErrorSheet
        title="The total, not the lines"
        facts={[
          { key: 'a', ok: true, text: 'Total read' },
          { key: 'b', ok: false, text: 'Lines hidden' },
        ]}
        primary={{ label: 'Split evenly', onPress: primary }}
        alternatives={[{ key: 't', title: 'Type the lines', onPress: alternative }]}
        onBack={back}
        userCaused
      />,
    );
    expect(screen.getByLabelText('Total read')).toBeTruthy();
    await activate(screen.getByRole('button', { name: 'Split evenly' }));
    await activate(screen.getByRole('button', { name: 'Type the lines' }));
    await activate(screen.getByRole('button', { name: 'Go back' }));
    expect([primary, alternative, back].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('marks offline writes and says when they will send', async () => {
    await renderUi(
      <View>
        <OfflinePill />
        <OutboxList
          items={[
            { key: '1', label: 'Expense', state: 'queued' },
            { key: '2', label: 'Photo', state: 'sent' },
          ]}
        />
      </View>,
    );
    expect(screen.getByLabelText('No signal').props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByRole('header', { name: "SENDS WHEN YOU'RE BACK" })).toBeTruthy();
    expect(screen.getByLabelText('Expense, Waiting for signal')).toBeTruthy();
    expect(screen.getByLabelText('Photo, Sent')).toBeTruthy();
  });

  it('timestamps stale data in the UI locale', async () => {
    const now = new Date('2026-09-27T12:00:00Z');
    expect(relativeAge(new Date('2026-09-27T09:00:00Z'), now, 'en')).toBe('3 hours ago');
    expect(relativeAge(new Date('2026-09-26T12:00:00Z'), now, 'en')).toBe('yesterday');
    expect(relativeAge(now, now, 'en')).toBe('this minute');
    await renderUi(<StaleCaption updatedAt={new Date('2026-09-27T11:30:00Z')} now={now} />);
    expect(screen.getByText('Updated 30 minutes ago')).toBeTruthy();
  });

  it('never dead-ends a denied permission', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const fallback = jest.fn();
    await renderUi(
      <PermissionCard
        title="No location"
        body="Tell me your hotel."
        fallback={{ label: 'Type my hotel', onPress: fallback }}
      />,
    );
    await activate(screen.getByRole('button', { name: 'Open Settings' }));
    await activate(screen.getByRole('button', { name: 'Type my hotel' }));
    expect(openSettings).toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('names the plan on locked teasers and meters quota', async () => {
    const onPress = jest.fn();
    const defer = jest.fn();
    await renderUi(
      <View>
        <LockedTeaser
          plan="passPlus"
          perk="Live flights"
          preview={<View testID="preview" />}
          onPress={onPress}
        />
        <LimitMeter
          label="Questions"
          used={5}
          limit={5}
          deferAction={{ label: 'Ask at midnight', onPress: defer }}
        />
      </View>,
    );
    await activate(screen.getByRole('button', { name: 'Pass+: Live flights' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByTestId('preview')).toBeNull();
    const meter = screen.getByRole('progressbar', { name: 'Questions' });
    expect(meter.props.accessibilityValue).toMatchObject({ now: 5, max: 5, text: '5 of 5 used' });
    await activate(screen.getByRole('button', { name: 'Ask at midnight' }));
    expect(defer).toHaveBeenCalled();
  });

  it('reads pending items as sending', async () => {
    await renderUi(
      <PendingSync
        pending
        author={{ name: 'Maya', joinIndex: 1 }}
        accessibilityLabel="Smoothie bowls"
      >
        <View />
      </PendingSync>,
    );
    expect(screen.getByLabelText('Smoothie bowls, sending')).toBeTruthy();
  });

  it('lists consequences and confirms or cancels', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderUi(
      <ConfirmSheet
        title="Leave crew?"
        consequences={['Expenses stay']}
        confirmLabel="Leave crew"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Expenses stay')).toBeTruthy();
    await activate(screen.getByRole('button', { name: 'Leave crew' }));
    await activate(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('reports job progress with the active step', async () => {
    await renderUi(
      <ChecklistProgress
        title="Building your plan"
        steps={[
          { key: 'a', label: 'Reading', status: 'done' },
          { key: 'b', label: 'Checking', status: 'active' },
          { key: 'c', label: 'Pricing', status: 'pending' },
        ]}
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Building your plan' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 3, now: 1, text: 'Checking' });
  });
});

describe('gallery fixtures', () => {
  const families = [
    'EmptyState',
    'Skeleton',
    'ErrorSheet',
    'OfflinePill',
    'OutboxList',
    'StaleCaption',
    'PermissionCard',
    'LockedTeaser',
    'LimitMeter',
    'PendingSync',
    'ConfirmSheet',
    'ChecklistProgress',
  ];

  it('has a fixture for every state component and renders the sticker-free ones', async () => {
    expect(listComponents()).toEqual(expect.arrayContaining(families));
    for (const component of families.filter((name) => name !== 'EmptyState')) {
      for (const fixture of fixturesFor(component)) {
        const { unmount } = await renderUi(<>{fixture.render()}</>);
        await unmount();
      }
    }
  });
});
