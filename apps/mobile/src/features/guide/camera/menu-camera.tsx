/**
 * The back camera of point and ask, with a photo output: it hands the screen a way to take one
 * still, and says so when the camera is refused or cannot run.
 *
 * The camera permission is never asked while the screen is still being presented (on iOS that
 * took the screen down until the person answered). With `renderAsk` the screen shows its own
 * pre-permission state and the system ask fires from its button; without it the ask fires by
 * itself once the screen has finished presenting. Once allowed, the preview fades in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- camera options and issue codes, never copy. */
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { usePresented } from '@/lib/navigation/use-presented';
import { asksByItself, cameraAccessStep } from '@/lib/permissions/camera-access';

import type { VisionCamera } from './vision-camera';

/** How long the preview takes to fade in once the camera is allowed. */
const PREVIEW_FADE_MS = 200;

export interface MenuCameraProps {
  readonly camera: VisionCamera;
  readonly onCapture: (capture: (() => Promise<string | null>) | null) => void;
  readonly onFailed: (issue: 'no_camera' | 'camera_denied') => void;
  /** The screen's own pre-permission state: what the camera is for and its "Allow" button. */
  readonly renderAsk?: (allow: () => void, asking: boolean) => ReactNode;
}

/** The back camera with a photo output; hands the screen a way to take one still. */
export function MenuCamera({ camera, onCapture, onFailed, renderAsk }: MenuCameraProps) {
  const focused = useIsFocused();
  const presented = usePresented();
  const { hasPermission, canRequestPermission, requestPermission } = camera.useCameraPermission();
  const device = camera.useCameraDevice('back');
  const photo = camera.usePhotoOutput({
    targetResolution: camera.CommonResolutions.FHD_4_3,
    qualityPrioritization: 'speed',
  });
  const [asking, setAsking] = useState(false);
  const autoAsked = useRef(false);
  const step = cameraAccessStep({ hasPermission, canRequestPermission, asking });
  const allow = useCallback(() => {
    if (asking) return;
    setAsking(true);
    void requestPermission()
      .catch(() => onFailed('camera_denied'))
      .finally(() => setAsking(false));
  }, [asking, requestPermission, onFailed]);
  useEffect(() => {
    if (!asksByItself(step, renderAsk !== undefined, presented, autoAsked.current)) return;
    autoAsked.current = true;
    void requestPermission().catch(() => onFailed('camera_denied'));
  }, [step, renderAsk, presented, requestPermission, onFailed]);
  useEffect(() => {
    if (step === 'denied') onFailed('camera_denied');
  }, [step, onFailed]);
  useEffect(() => {
    onCapture(async () => {
      const file = await photo.capturePhotoToFile({ enableShutterSound: false }, {});
      return file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
    });
    return () => onCapture(null);
  }, [photo, onCapture]);
  if (step === 'ask' || step === 'asking') return renderAsk?.(allow, step === 'asking') ?? null;
  if (!hasPermission || device === undefined) return null;
  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      {...(renderAsk === undefined
        ? {}
        : { entering: FadeIn.duration(PREVIEW_FADE_MS).reduceMotion(ReduceMotion.Never) })}
    >
      <camera.Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={focused}
        outputs={[photo]}
        onError={() => onFailed('no_camera')}
      />
    </Animated.View>
  );
}
