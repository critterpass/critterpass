/**
 * The live camera is only ever a preview, and anything short of a working camera leaves the
 * illustration: a build without the camera's native side (where the package is never loaded), a
 * refused permission, or a camera error. The camera module is
 * a native boundary Jest can't run, so it is stood in for per case.
 */
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { CAMERA_HYBRID_OBJECTS, LiveCamera, resetVisionCameraForTests } from '../live-camera';

/** The native registry as a build reports it: the given hybrid objects are registered. */
function nativeRegistry(names: readonly string[]) {
  jest.doMock('react-native-nitro-modules', () => ({
    NitroModules: { hasHybridObject: (name: string) => names.includes(name) },
  }));
}

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
  jest.dontMock('react-native-nitro-modules');
});

describe('live camera', () => {
  it('never loads the camera package in a build without its native side', async () => {
    // Loading it there throws while the module loads, which Metro reports as fatal.
    const loaded = jest.fn();
    jest.doMock('react-native-vision-camera', () => {
      loaded();
      return standIn({ hasPermission: true, canRequestPermission: false });
    });
    nativeRegistry(['MMKVFactory', 'ImageFactory']);
    await render(<LiveCamera enabled />);
    expect(screen.toJSON()).toBeNull();
    expect(loaded).not.toHaveBeenCalled();
  });

  it('asks in context, and shows nothing while the permission is refused', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: false, canRequestPermission: true }),
    );
    await render(<LiveCamera enabled />);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('runs a preview with no outputs, and falls back on a camera error', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }),
    );
    await render(<LiveCamera enabled />);
    expect(screen.getByTestId('camera-preview')).toBeTruthy();
    expect(cameraProps?.outputs).toEqual([]);
    expect(cameraProps?.isActive).toBe(true);
    await act(() => cameraProps?.onError(new Error('camera in use')));
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('stays off, without loading the camera, until it is switched on', async () => {
    const loaded = jest.fn();
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () => {
      loaded();
      return standIn({ hasPermission: true, canRequestPermission: false });
    });
    await render(<LiveCamera />);
    expect(screen.toJSON()).toBeNull();
    expect(loaded).not.toHaveBeenCalled();
  });
});
