import type { OcrQualityIssue, OcrQualitySignals } from './types';

/**
 * Where each raw signal turns into a problem the scan screen names. Both platforms send the same
 * signals, so the classification lives here once. The founder's receipt photos in `fixtures/`
 * are the reference set these lines are checked against.
 */
export const QUALITY_THRESHOLDS = {
  /** Baseline angle spread in degrees at or above which the page reads as crumpled or folded. */
  curvature: 3.5,
  /** Laplacian variance below which the photo reads as out of focus or shaken. */
  blur: 40,
  /** Share of blown-out pixels at or above which a reflection hides part of the page. */
  glare: 0.05,
  /** Share of lines touching an edge at or above which the page runs out of frame. */
  clipped: 0.1,
} as const;

function measured(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * The one issue the scan screen names, in the order a retake fixes them: flatten the page first,
 * then hold still, then tilt away from the light, then fit it all in. `null` when nothing is off.
 * A signal that could not be measured (not a finite number) never raises an issue.
 */
export function classifyQuality(signals: OcrQualitySignals): OcrQualityIssue | null {
  const { curvature, blur, glare, clipped } = signals;
  if (measured(curvature) && curvature >= QUALITY_THRESHOLDS.curvature) return 'crumpled';
  if (measured(blur) && blur < QUALITY_THRESHOLDS.blur) return 'blurry';
  if (measured(glare) && glare >= QUALITY_THRESHOLDS.glare) return 'glare';
  if (measured(clipped) && clipped >= QUALITY_THRESHOLDS.clipped) return 'cut_off';
  return null;
}
