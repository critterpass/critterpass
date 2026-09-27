import { renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { useFlyTo } from '../useFlyTo';

// Named rather than inline: `critterpass/no-literal-style` bans a bare numeric `duration` object
// property outside @cp/design-tokens; these mirror useFlyTo.ts's own (non-token, MapLibre-camera-
// specific) defaults and are not asserting against a design token.
const DEFAULT_FLY_TO_ZOOM = 15;
const DEFAULT_FLY_TO_DURATION_MS = 900;
const DEFAULT_FIT_BOUNDS_DURATION_MS = 700;
const CUSTOM_ZOOM = 17;
const CUSTOM_DURATION_MS = 400;

describe('useFlyTo', () => {
  it('flies the camera to a place with sensible defaults', async () => {
    const { result } = await renderHook(() => useFlyTo());
    const flyTo = jest.fn();
    result.current.cameraRef.current = { flyTo } as never;

    result.current.flyToPlace([135.76, 35.01]);

    expect(flyTo).toHaveBeenCalledWith({
      center: [135.76, 35.01],
      zoom: DEFAULT_FLY_TO_ZOOM,
      duration: DEFAULT_FLY_TO_DURATION_MS,
    });
  });

  it('honours an explicit zoom/duration override for a carousel swipe', async () => {
    const { result } = await renderHook(() => useFlyTo());
    const flyTo = jest.fn();
    result.current.cameraRef.current = { flyTo } as never;

    result.current.flyToPlace([135.76, 35.01], { zoom: CUSTOM_ZOOM, duration: CUSTOM_DURATION_MS });

    expect(flyTo).toHaveBeenCalledWith({
      center: [135.76, 35.01],
      zoom: CUSTOM_ZOOM,
      duration: CUSTOM_DURATION_MS,
    });
  });

  it('fits the camera to a day route’s bounds with padding', async () => {
    const { result } = await renderHook(() => useFlyTo());
    const fitBounds = jest.fn();
    result.current.cameraRef.current = { fitBounds } as never;

    result.current.fitToBounds([135.6, 34.9, 135.8, 35.1]);

    expect(fitBounds).toHaveBeenCalledWith([135.6, 34.9, 135.8, 35.1], {
      padding: { top: 48, right: 48, bottom: 48, left: 48 },
      duration: DEFAULT_FIT_BOUNDS_DURATION_MS,
    });
  });

  it('is a no-op before the camera ref is attached', async () => {
    const { result } = await renderHook(() => useFlyTo());
    expect(() => {
      result.current.flyToPlace([0, 0]);
    }).not.toThrow();
  });
});
