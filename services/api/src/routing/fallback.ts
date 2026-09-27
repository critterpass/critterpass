/**
 * Straight-line fallbacks for when the routing provider is unavailable, unconfigured, or cannot
 * serve the mode (transit). Always flagged `estimate: true` with the reason, never presented as a
 * routed answer.
 */
import { estimateStraightLineEta } from '@cp/domain';

import type { EstimateReason, MatrixInput, MatrixResult } from './provider';

export function fallbackMatrix(input: MatrixInput, reason: EstimateReason): MatrixResult {
  const cells = input.origins.map((origin) =>
    input.destinations.map((dest) =>
      estimateStraightLineEta(
        {
          originLat: origin.lat,
          originLng: origin.lng,
          destLat: dest.lat,
          destLng: dest.lng,
          mode: input.mode,
        },
        reason,
      ),
    ),
  );
  return {
    minutes: cells.map((row) => row.map((cell) => cell.minutes)),
    distanceM: cells.map((row) => row.map((cell) => cell.distanceM)),
    estimate: true,
    estimateReason: reason,
    traffic: false,
    mode: input.mode,
    source: 'straight_line',
    requests: 0,
  };
}
