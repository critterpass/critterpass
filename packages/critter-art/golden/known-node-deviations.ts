/**
 * Fully-drawn cases where the Node backend (`@napi-rs/canvas`) differs from Chromium beyond the golden
 * thresholds while the browser backend matches Chromium exactly on the same case, so the port itself is
 * correct: flat opaque silhouette regions rasterise slightly differently in the Node Skia build (evidence
 * in golden/README.md). Each entry records the measured values as ceilings, so any case that drifts
 * further, or a browser-side difference, still fails the run.
 */
export interface NodeDeviationCeiling {
  readonly meanAbsDiff: number;
  readonly pctPixelsOver8: number;
}

export const KNOWN_NODE_DEVIATIONS: Readonly<Record<string, NodeDeviationCeiling>> = {
  'cp-002-96pt-locked-p1': { meanAbsDiff: 0.28, pctPixelsOver8: 1.3 },
  'cp-088-96pt-locked-p1': { meanAbsDiff: 0.31, pctPixelsOver8: 1.22 },
  'cp-130-96pt-locked-p1': { meanAbsDiff: 0.26, pctPixelsOver8: 1.05 },
};

/** Whether a failing Node comparison is one of the recorded deviations and still within its ceiling. */
export function isKnownNodeDeviation(id: string, node: NodeDeviationCeiling): boolean {
  const ceiling = KNOWN_NODE_DEVIATIONS[id];
  return (
    ceiling !== undefined &&
    node.meanAbsDiff <= ceiling.meanAbsDiff &&
    node.pctPixelsOver8 <= ceiling.pctPixelsOver8
  );
}
