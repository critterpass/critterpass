/**
 * The camera package, loaded only where it can run. Metro reports an error thrown while a module
 * loads as fatal, around any try/catch, so the package is required only once the native side says
 * every object it creates on load is registered; emulators and simulators have no camera to show
 * (and loading it stalled the Android emulator), so it is never loaded there.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the native module loads lazily, so an app without it keeps working. */
import { isDevice } from 'expo-device';
import type * as NitroModulesModule from 'react-native-nitro-modules';
import type * as VisionCameraModule from 'react-native-vision-camera';

export type VisionCamera = typeof VisionCameraModule;

const HYBRID_OBJECTS = [
  'CameraFactory',
  'FrameConverter',
  'ImageFactory',
  'ImageLoaderFactory',
  'ImageUtils',
] as const;

let loaded: VisionCamera | null | undefined;

function nativeCameraPresent(): boolean {
  try {
    const { NitroModules } = require('react-native-nitro-modules') as typeof NitroModulesModule;
    return HYBRID_OBJECTS.every((name) => NitroModules.hasHybridObject(name));
  } catch {
    return false;
  }
}

/** The camera module, or null when this app or this phone has no camera to run. */
export function menuCameraModule(): VisionCamera | null {
  if (loaded !== undefined) return loaded;
  if (!isDevice || !nativeCameraPresent()) {
    loaded = null;
    return loaded;
  }
  try {
    loaded = require('react-native-vision-camera') as VisionCamera;
  } catch {
    loaded = null;
  }
  return loaded;
}
