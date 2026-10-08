/**
 * The back camera of point and ask, with a photo output: it hands the screen a way to take one
 * still, and says so when the camera is refused or cannot run.
 */
/* eslint-disable lingui/no-unlocalized-strings -- camera options and issue codes, never copy. */
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import type { VisionCamera } from './vision-camera';

/** The back camera with a photo output; hands the screen a way to take one still. */
export function MenuCamera({
  camera,
  onCapture,
  onFailed,
}: {
  readonly camera: VisionCamera;
  readonly onCapture: (capture: (() => Promise<string | null>) | null) => void;
  readonly onFailed: (issue: 'no_camera' | 'camera_denied') => void;
}) {
  const focused = useIsFocused();
  const { hasPermission, canRequestPermission, requestPermission } = camera.useCameraPermission();
  const device = camera.useCameraDevice('back');
  const photo = camera.usePhotoOutput({
    targetResolution: camera.CommonResolutions.FHD_4_3,
    qualityPrioritization: 'speed',
  });
  useEffect(() => {
    // Asked here, in context: the person has just opened the menu camera.
    if (canRequestPermission) void requestPermission().catch(() => onFailed('camera_denied'));
  }, [canRequestPermission, requestPermission, onFailed]);
  const refused = !hasPermission && !canRequestPermission;
  useEffect(() => {
    if (refused) onFailed('camera_denied');
  }, [refused, onFailed]);
  useEffect(() => {
    onCapture(async () => {
      const file = await photo.capturePhotoToFile({ enableShutterSound: false }, {});
      return file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
    });
    return () => onCapture(null);
  }, [photo, onCapture]);
  if (!hasPermission || device === undefined) return null;
  return (
    <camera.Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={focused}
      outputs={[photo]}
      onError={() => onFailed('no_camera')}
    />
  );
}
