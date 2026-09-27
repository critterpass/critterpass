/**
 * Camera control for `CpMap`: fly-to on carousel swipe, fit-bounds for a day route (F-031
 * "Camera"). Wraps `@maplibre/maplibre-react-native`'s imperative `CameraRef` — MapLibre camera
 * moves are native-side animations, not something a declarative prop alone drives on every swipe.
 */
import type { CameraRef, LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';
import type { RefObject } from 'react';
import { useCallback, useRef } from 'react';

export interface UseFlyToResult {
  readonly cameraRef: RefObject<CameraRef | null>;
  /** Carousel swipe / "show this place" — flies to a single point. */
  readonly flyToPlace: (center: LngLat, options?: { zoom?: number; duration?: number }) => void;
  /** Fits the camera to a day's full route or a cluster's member pins. */
  readonly fitToBounds: (bounds: LngLatBounds, padding?: number) => void;
}

const DEFAULT_FLY_TO_ZOOM = 15;
const DEFAULT_FLY_TO_DURATION_MS = 900;
const DEFAULT_FIT_BOUNDS_DURATION_MS = 700;

export function useFlyTo(): UseFlyToResult {
  const cameraRef = useRef<CameraRef>(null);

  const flyToPlace = useCallback(
    (center: LngLat, options?: { zoom?: number; duration?: number }) => {
      cameraRef.current?.flyTo({
        center,
        zoom: options?.zoom ?? DEFAULT_FLY_TO_ZOOM,
        duration: options?.duration ?? DEFAULT_FLY_TO_DURATION_MS,
      });
    },
    [],
  );

  const fitToBounds = useCallback((bounds: LngLatBounds, padding = 48) => {
    cameraRef.current?.fitBounds(bounds, {
      padding: { top: padding, right: padding, bottom: padding, left: padding },
      duration: DEFAULT_FIT_BOUNDS_DURATION_MS,
    });
  }, []);

  return { cameraRef, flyToPlace, fitToBounds };
}
