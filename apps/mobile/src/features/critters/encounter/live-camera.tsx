/**
 * The live camera behind an encounter: the back camera's preview, and nothing else. There are no
 * photo, video or frame outputs, so no frame is saved, processed or sent anywhere; the preview
 * only draws on screen. It runs while the encounter screen is focused and the app is in front.
 *
 * It is off unless the server switches it on (`client_config` `critters.live_camera`). Anything
 * short of a working camera leaves the illustrated scene in place: a build without the
 * native module, an emulator or simulator, a refused (or not yet granted) permission, no back
 * camera, a camera that does not start within a moment, or any camera error.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the native module loads lazily, so a build without it keeps working. */
import { isDevice } from 'expo-device';
import { useIsFocused } from 'expo-router';
import { Component, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type * as NitroModulesModule from 'react-native-nitro-modules';
import type * as VisionCameraModule from 'react-native-vision-camera';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { useInFront } from '../data/app-front';
import { watchQuery } from '../data/live-rows';

type VisionCamera = typeof VisionCameraModule;

let loaded: VisionCamera | null | undefined;

/**
 * Native objects the camera package creates as it loads (its own and NitroImage's). Metro reports
 * an error thrown while a module loads as fatal, around any try/catch, so the package is only
 * required once the native side says every one of them is registered.
 */
export const CAMERA_HYBRID_OBJECTS = [
  'CameraFactory',
  'FrameConverter',
  'ImageFactory',
  'ImageLoaderFactory',
  'ImageUtils',
] as const;

function nativeCameraPresent(): boolean {
  try {
    const { NitroModules } = require('react-native-nitro-modules') as typeof NitroModulesModule;
    return CAMERA_HYBRID_OBJECTS.every((name) => NitroModules.hasHybridObject(name));
  } catch {
    return false;
  }
}

/** The camera module, or null when this build has no camera (or it fails to start). */
export function visionCamera(): VisionCamera | null {
  if (loaded !== undefined) return loaded;
  // Emulators and simulators have no camera to show, and on the Android emulator loading the
  // camera stalled the whole app (frames of several seconds, taps lost): never load it there.
  if (!isDevice || !nativeCameraPresent()) {
    loaded = null;
    return loaded;
  }
  try {
    loaded = loadPackage();
  } catch {
    loaded = null;
  }
  return loaded;
}

const requirePackage = () => require('react-native-vision-camera') as VisionCamera;
let loadPackage: () => VisionCamera = requirePackage;

/** Tests reset the cached module between cases, and may stand in for the package's loading. */
export function resetVisionCameraForTests(load?: () => VisionCamera): void {
  loaded = undefined;
  loadPackage = load ?? requirePackage;
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

/**
 * How long the camera gets to find its back camera and then to show a preview. Past either, the
 * illustrated scene stays and the camera is released: a camera that never starts (no device, a
 * device list that never loads) must not hold the screen, or the app, waiting.
 */
export const CAMERA_START_TIMEOUT_MS = 2000;

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
  const [started, setStarted] = useState(false);
  const { canRequestPermission, requestPermission, hasPermission } = permission;
  useEffect(() => {
    // Asked here, in context: the traveller has just opened an encounter.
    if (canRequestPermission) void requestPermission().catch(onError);
  }, [canRequestPermission, requestPermission, onError]);
  // Refused for good (nothing left to ask): the illustration, and the camera let go.
  const refused = !hasPermission && !canRequestPermission;
  useEffect(() => {
    if (refused) onError();
  }, [refused, onError]);
  // Once allowed, the back camera and then its preview each get a short time to appear.
  useEffect(() => {
    if (!hasPermission || started) return undefined;
    const timer = setTimeout(onError, CAMERA_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasPermission, device, started, onError]);
  if (!hasPermission || device === undefined) return null;
  return (
    <camera.Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={focused && front}
      outputs={[]}
      onError={onError}
      onPreviewStarted={() => setStarted(true)}
    />
  );
}

/* eslint-disable lingui/no-unlocalized-strings -- SQL and a table name, never copy. */
const FLAG_SQL = "SELECT value FROM client_config WHERE key = 'critters.live_camera'";
const FLAG_TABLES = ['client_config'];
/* eslint-enable lingui/no-unlocalized-strings */

/**
 * Whether the live camera is switched on for this install (`client_config`, off unless the server
 * says otherwise). The first device runs with the camera module in the build showed the app's
 * drawing stop once the camera tried to start, so the illustrated scene is what travellers get
 * until the preview has been checked on real phones.
 */
function useLiveCameraSwitch(): boolean {
  const localFirst = useContext(LocalFirstContext);
  const [on, setOn] = useState(false);
  const db = localFirst?.db ?? null;
  useEffect(() => {
    if (db === null) return undefined;
    return watchQuery<{ value: string | null }>(db, FLAG_SQL, [], FLAG_TABLES, (rows) => {
      const value = rows[0]?.value ?? '';
      setOn(value === 'true' || value === '1');
    });
  }, [db]);
  return on;
}

/** The live backdrop, or nothing (the scene's illustration shows through). */
export function LiveCamera({ enabled }: { readonly enabled?: boolean }) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const switchedOn = useLiveCameraSwitch();
  const on = (enabled ?? switchedOn) && !failed;
  // The package loads after the scene's first frame, never inside it.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!on) return undefined;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [on]);
  if (!on || !settled) return null;
  const camera = visionCamera();
  if (camera === null) return null;
  return (
    <CameraBoundary onError={onError}>
      <Preview camera={camera} onError={onError} />
    </CameraBoundary>
  );
}
