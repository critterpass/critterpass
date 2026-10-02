/**
 * The live camera is only ever a preview, and anything short of a working camera leaves the
 * illustration: a build without the camera's native side (where the package is never loaded), a
 * refused permission, or a camera error. The camera module is
 * a native boundary Jest can't run, so it is stood in for per case.
 */
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
let mockRealDevice = true;
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockRealDevice;
  },
}));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { View } from 'react-native';

import {
  CAMERA_HYBRID_OBJECTS,
  CAMERA_START_TIMEOUT_MS,
  LiveCamera,
  resetVisionCameraForTests,
} from '../live-camera';

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
  readonly onPreviewStarted: () => void;
}

let cameraProps: CameraProps | null = null;
let held = 0;
const requestPermission = jest.fn(() => Promise.resolve(false));

function standIn(
  permission: { hasPermission: boolean; canRequestPermission: boolean },
  device: { id: string } | null = { id: 'back' },
) {
  return {
    useCameraPermission: () => ({ ...permission, status: 'x', requestPermission }),
    // The device hook is what holds the camera: mounted = the camera is held.
    useCameraDevice: () => {
      useEffect(() => {
        held += 1;
        return () => {
          held -= 1;
        };
      }, []);
      return device ?? undefined;
    },
    Camera: (props: CameraProps) => {
      cameraProps = props;
      return <View testID="camera-preview" />;
    },
  };
}

beforeEach(() => {
  mockRealDevice = true;
  cameraProps = null;
  held = 0;
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
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('camera-preview')).toBeNull();
  });

  it('runs a preview with no outputs, and falls back on a camera error', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }),
    );
    await render(<LiveCamera enabled />);
    expect(await screen.findByTestId('camera-preview')).toBeTruthy();
    await act(() => cameraProps?.onPreviewStarted());
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

  it('lets the camera go when no back camera turns up in time', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }, null),
    );
    await render(<LiveCamera enabled />);
    await waitFor(() => expect(held).toBe(1));
    await waitFor(() => expect(held).toBe(0), { timeout: CAMERA_START_TIMEOUT_MS + 2000 });
    expect(cameraProps).toBeNull();
  });

  it('lets the camera go when its preview never starts', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }),
    );
    await render(<LiveCamera enabled />);
    expect(await screen.findByTestId('camera-preview')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('camera-preview')).toBeNull(), {
      timeout: CAMERA_START_TIMEOUT_MS + 2000,
    });
    expect(held).toBe(0);
  });

  it('keeps the preview once it has started', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: true, canRequestPermission: false }),
    );
    await render(<LiveCamera enabled />);
    expect(await screen.findByTestId('camera-preview')).toBeTruthy();
    await act(() => cameraProps?.onPreviewStarted());
    await act(() => new Promise((resolve) => setTimeout(resolve, CAMERA_START_TIMEOUT_MS + 500)));
    expect(screen.getByTestId('camera-preview')).toBeTruthy();
  });

  it('shows nothing when the camera package throws as it loads', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () => {
      throw new Error('native camera failed to initialise');
    });
    const view = await render(<LiveCamera enabled />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(view.toJSON()).toBeNull();
  });

  it('lets the camera go when the permission is refused for good', async () => {
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () =>
      standIn({ hasPermission: false, canRequestPermission: false }),
    );
    const view = await render(<LiveCamera enabled />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(view.toJSON()).toBeNull();
    expect(held).toBe(0);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('never loads the camera package on an emulator or simulator', async () => {
    mockRealDevice = false;
    const loaded = jest.fn();
    nativeRegistry(CAMERA_HYBRID_OBJECTS);
    jest.doMock('react-native-vision-camera', () => {
      loaded();
      return standIn({ hasPermission: true, canRequestPermission: false });
    });
    const view = await render(<LiveCamera enabled />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(view.toJSON()).toBeNull();
    expect(loaded).not.toHaveBeenCalled();
  });
});
