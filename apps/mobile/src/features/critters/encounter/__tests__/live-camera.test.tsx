/**
 * The live camera is only ever a preview, and anything short of a working camera leaves the
 * illustration: no native module, a refused permission, or a camera error. The camera module is
 * a native boundary Jest can't run, so it is stood in for per case.
 */
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { LiveCamera, resetVisionCameraForTests } from '../live-camera';

interface CameraProps {
  readonly isActive: boolean;
  readonly outputs: readonly unknown[];
  readonly onError: (error: Error) => void;
}

let cameraProps: CameraProps | null = null;
const requestPermission = jest.fn(() => Promise.resolve(false));

function standIn(permission: { hasPermission: boolean; canRequestPermission: boolean }) {
  return {
    useCameraPermission: () => ({ ...permission, status: 'x', requestPermission }),
    useCameraDevice: () => ({ id: 'back' }),
    Camera: (props: CameraProps) => {
      cameraProps = props;
      return <View testID="camera-preview" />;
    },
  };
}

beforeEach(() => {
  cameraProps = null;
  requestPermission.mockClear();
  resetVisionCameraForTests();
  jest.resetModules();
});

afterEach(() => {
  jest.dontMock('react-native-vision-camera');
});

describe('live camera', () => {
  it('shows nothing in a build without the camera module', async () => {
    jest.doMock('react-native-vision-camera', () => {
      throw new Error('native module missing');
    });
    await render(<LiveCamera />);
    expect(screen.toJSON()).toBeNull();
  });

  it('asks in context, and shows nothing while the permission is refused', async () => {
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: false, canRequestPermission: true }),
    );
    await render(<LiveCamera />);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('runs a preview with no outputs, and falls back on a camera error', async () => {
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }),
    );
    await render(<LiveCamera />);
    expect(screen.getByTestId('camera-preview')).toBeTruthy();
    expect(cameraProps?.outputs).toEqual([]);
    expect(cameraProps?.isActive).toBe(true);
    await act(() => cameraProps?.onError(new Error('camera in use')));
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });
});
