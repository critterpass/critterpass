/**
 * The live camera behind an encounter: the back camera's preview, and nothing else. There are no
 * photo, video or frame outputs, so no frame is saved, processed or sent anywhere; the preview
 * only draws on screen. It runs while the encounter screen is focused and the app is in front.
 *
 * Anything short of a working camera leaves the illustrated scene in place: a build without the
 * native module, a refused (or not yet granted) permission, no back camera, or any camera error.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the native module loads lazily, so a build without it keeps working. */
import { useIsFocused } from 'expo-router';
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type * as VisionCameraModule from 'react-native-vision-camera';

import { useInFront } from '../data/app-front';

type VisionCamera = typeof VisionCameraModule;

let loaded: VisionCamera | null | undefined;

/** The camera module, or null when this build has no camera (or it fails to start). */
export function visionCamera(): VisionCamera | null {
  if (loaded !== undefined) return loaded;
  try {
    loaded = require('react-native-vision-camera') as VisionCamera;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Tests reset the cached module between cases. */
export function resetVisionCameraForTests(): void {
  loaded = undefined;
}

class CameraBoundary extends Component<
  { readonly children: ReactNode; readonly onError: () => void },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Preview({
  camera,
  onError,
}: {
  readonly camera: VisionCamera;
  readonly onError: () => void;
}) {
  const focused = useIsFocused();
  const front = useInFront();
  const permission = camera.useCameraPermission();
  const device = camera.useCameraDevice('back');
  const { canRequestPermission, requestPermission } = permission;
  useEffect(() => {
    // Asked here, in context: the traveller has just opened an encounter.
    if (canRequestPermission) void requestPermission().catch(onError);
  }, [canRequestPermission, requestPermission, onError]);
  if (!permission.hasPermission || device === undefined) return null;
  return (
    <camera.Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={focused && front}
      outputs={[]}
      onError={onError}
    />
  );
}

/** The live backdrop, or nothing (the scene's illustration shows through). */
export function LiveCamera() {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const camera = visionCamera();
  if (camera === null || failed) return null;
  return (
    <CameraBoundary onError={onError}>
      <Preview camera={camera} onError={onError} />
    </CameraBoundary>
  );
}
