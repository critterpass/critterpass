import { act, fireEvent, screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, View } from 'react-native';

import { ConfirmSheet } from '../states/ConfirmSheet';
import { EmptyState } from '../states/EmptyState';
import { ErrorSheet } from '../states/ErrorSheet';
import { LockedTeaser } from '../states/LockedTeaser';
import { PermissionCard } from '../states/PermissionCard';
import { Skeleton, SLOW_LOADING_MS } from '../states/Skeleton';
import { relativeAge, StaleCaption } from '../states/StaleCaption';
import { renderUi } from '../test-support/render';

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

  it('names the plan on locked teasers', async () => {
    const onPress = jest.fn();
    await renderUi(
      <View>
        <LockedTeaser
          plan="passPlus"
          perk="Live flights"
          preview={<View testID="preview" />}
          onPress={onPress}
        />
      </View>,
    );
    await activate(screen.getByRole('button', { name: 'Pass+: Live flights' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByTestId('preview')).toBeNull();
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
});
