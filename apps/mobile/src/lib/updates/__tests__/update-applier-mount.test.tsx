/**
 * The applier wired to expo-updates and the app's state, mounted where the app mounts it (beside
 * the shake listener). A production build never mounts it: expo-updates keeps its default there.
 */
const mockExtra: { appVariant: string } = { appVariant: 'staging' };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { name: 'CritterPass', extra: mockExtra };
    },
  },
}));
jest.mock('expo-router', () => ({
  router: { push: () => undefined },
  useNavigationContainerRef: () => ({ isReady: () => true }),
  useSegments: () => ['(tabs)'],
}));
jest.mock('react-native-reanimated', () => ({
  SensorType: { ACCELEROMETER: 1 },
  useAnimatedSensor: () => ({ sensor: { value: { x: 0, y: 0, z: 0 } } }),
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedReaction: () => undefined,
}));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
const mockUpdates: { isUpdatePending: boolean; downloadedUpdate?: { updateId: string } } = {
  isUpdatePending: false,
};
const mockUseUpdates = jest.fn(() => mockUpdates);
const mockReload = jest.fn(() => Promise.resolve());
jest.mock('expo-updates', () => ({
  useUpdates: () => mockUseUpdates(),
  reloadAsync: () => mockReload(),
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { AppState, Keyboard, type AppStateStatus } from 'react-native';

import { DevToolsShake } from '../../dev-tools/DevToolsShake';
import { provideSheetsOpen } from '../../interaction/busy';

describe('the update applier at the root', () => {
  let appStateChanged: (state: AppStateStatus) => void = () => undefined;
  const leaveAndComeBack = async () => {
    await act(() => appStateChanged('background'));
    await act(() => appStateChanged('active'));
  };

  beforeEach(() => {
    mockUseUpdates.mockClear();
    mockReload.mockClear();
    mockUpdates.isUpdatePending = false;
    delete mockUpdates.downloadedUpdate;
    provideSheetsOpen(() => false);
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    const listeners: ((state: AppStateStatus) => void)[] = [];
    appStateChanged = (state) => listeners.forEach((listener) => listener(state));
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: () => undefined };
    });
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  });

  it('never watches for updates in a production build', async () => {
    mockExtra.appVariant = 'production';
    mockUpdates.isUpdatePending = true;
    mockUpdates.downloadedUpdate = { updateId: 'update-production' };
    await render(<DevToolsShake />);
    await leaveAndComeBack();
    expect(mockUseUpdates).not.toHaveBeenCalled();
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('restarts once on staging when the app returns to the front with an update downloaded', async () => {
    mockExtra.appVariant = 'staging';
    const view = await render(<DevToolsShake />);
    // The download finishes long after launch: nothing restarts under the person's hands.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    mockUpdates.isUpdatePending = true;
    mockUpdates.downloadedUpdate = { updateId: 'update-returning' };
    await view.rerender(<DevToolsShake />);
    expect(mockReload).not.toHaveBeenCalled();

    await leaveAndComeBack();
    expect(mockReload).toHaveBeenCalledTimes(1);
    await leaveAndComeBack();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('waits while a sheet is up or the keyboard is showing', async () => {
    mockExtra.appVariant = 'staging';
    mockUpdates.isUpdatePending = true;
    mockUpdates.downloadedUpdate = { updateId: 'update-while-busy' };
    provideSheetsOpen(() => true);
    await render(<DevToolsShake />);
    await leaveAndComeBack();
    expect(mockReload).not.toHaveBeenCalled();

    provideSheetsOpen(() => false);
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true);
    await leaveAndComeBack();
    expect(mockReload).not.toHaveBeenCalled();

    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    await leaveAndComeBack();
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('does not restart for a passing moment out of focus that never reached the background', async () => {
    mockExtra.appVariant = 'staging';
    const view = await render(<DevToolsShake />);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    mockUpdates.isUpdatePending = true;
    mockUpdates.downloadedUpdate = { updateId: 'update-inactive' };
    await view.rerender(<DevToolsShake />);
    await act(() => appStateChanged('inactive'));
    await act(() => appStateChanged('active'));
    expect(mockReload).not.toHaveBeenCalled();
  });
});
