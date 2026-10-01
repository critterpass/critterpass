/**
 * The shake listener holds the accelerometer only on builds that carry Developer tools. A
 * production build must never subscribe to the sensor. (A separate file: the mocked expo-constants
 * must hold for every module this file loads.)
 */
const mockExtra: { appVariant: string } = { appVariant: 'development' };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { name: 'CritterPass', extra: mockExtra };
    },
  },
}));
const mockPush = jest.fn();
const mockSegments: { current: string[] } = { current: [] };
jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href) },
  useNavigationContainerRef: () => ({ isReady: () => true }),
  useSegments: () => mockSegments.current,
}));
const mockUseAnimatedSensor = jest.fn((..._args: unknown[]) => ({
  sensor: { value: { x: 0, y: 0, z: 0, interfaceOrientation: 0 } },
}));
/** The reaction the listener registered: tests feed it samples like the sensor thread would. */
const mockReaction: { current: ((sample: unknown) => void) | null } = { current: null };
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    SensorType: { ACCELEROMETER: 1 },
    useAnimatedSensor: (...args: unknown[]) => {
      // Like the real hook: the sensor is held from mount to unmount.
      react.useEffect(() => () => void (mockReaction.current = null), []);
      return mockUseAnimatedSensor(...args);
    },
    useSharedValue: (value: unknown) => react.useRef({ value }).current,
    useAnimatedReaction: (_prepare: unknown, onSample: (sample: unknown) => void) => {
      mockReaction.current = onSample;
    },
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { DevToolsShake } from '../DevToolsShake';

declare const globalThis: { __DEV__: boolean };

/** Two seconds of a hard 5 Hz shake through the registered reaction. */
function shake(): void {
  const now = jest.spyOn(performance, 'now');
  for (let ms = 0; ms <= 2000; ms += 20) {
    now.mockReturnValue(ms);
    mockReaction.current?.({ x: 30 * Math.sin(2 * Math.PI * 5 * (ms / 1000)), y: 0, z: -9.81 });
  }
  now.mockRestore();
}

describe('DevToolsShake', () => {
  let appStateChanged: (state: AppStateStatus) => void = () => undefined;

  beforeEach(() => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateChanged = listener as (state: AppStateStatus) => void;
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    mockUseAnimatedSensor.mockClear();
    mockPush.mockClear();
    mockReaction.current = null;
    mockSegments.current = [];
    // Release builds decide by variant alone.
    globalThis.__DEV__ = false;
  });

  it('never subscribes to the accelerometer in a production build', async () => {
    mockExtra.appVariant = 'production';
    await render(<DevToolsShake />);
    expect(mockUseAnimatedSensor).not.toHaveBeenCalled();
    expect(mockReaction.current).toBeNull();
  });

  it.each(['staging', 'development'])(
    'opens Developer tools on a shake in %s builds',
    async (variant) => {
      mockExtra.appVariant = variant;
      await render(<DevToolsShake />);
      expect(mockUseAnimatedSensor).toHaveBeenCalled();
      shake();
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(dev)');
    },
  );

  it('does nothing when Developer tools is already open', async () => {
    mockExtra.appVariant = 'staging';
    mockSegments.current = ['(dev)', 'accounts'];
    await render(<DevToolsShake />);
    expect(mockReaction.current).not.toBeNull();
    shake();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets go of the accelerometer while the app is in the background', async () => {
    mockExtra.appVariant = 'staging';
    await render(<DevToolsShake />);
    expect(mockReaction.current).not.toBeNull();
    await act(() => appStateChanged('background'));
    expect(mockReaction.current).toBeNull();
    await act(() => appStateChanged('active'));
    expect(mockReaction.current).not.toBeNull();
  });
});
