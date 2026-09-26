import { createCanvas, loadImage } from '@napi-rs/canvas';

// Thresholds from docs/system-architecture.md §4.7 / the design analysis report.
export const MEAN_ABS_DIFF_THRESHOLD = 0.5;
export const PIXELS_OVER_8_PCT_THRESHOLD = 1;
const PER_CHANNEL_DIFF_FLOOR = 8;

// The design report's own CI note: "thresholds: mean abs <0.5/255, >8/255 px <1%; icons ≤24 pt
// looser" — a handful of AA edge pixels are a much larger share of a 24pt raster's pixel count.
export const SMALL_SIZE_MAX_PT = 24;
export const SMALL_SIZE_MEAN_ABS_DIFF_THRESHOLD = 1;
export const SMALL_SIZE_PIXELS_OVER_8_PCT_THRESHOLD = 5;

export interface DiffResult {
  readonly width: number;
  readonly height: number;
  readonly meanAbsDiff: number;
  readonly pctPixelsOver8: number;
  readonly maxChannelDiff: number;
  readonly diffPng: Buffer;
}

/**
 * Compares two same-size PNG buffers channel-by-channel (RGBA), producing the parity metrics the
 * golden thresholds are measured against plus a visual diff image (amplified absolute difference).
 */
export async function comparePngBuffers(expected: Buffer, actual: Buffer): Promise<DiffResult> {
  const expectedImage = await loadImage(expected);
  const actualImage = await loadImage(actual);
  if (expectedImage.width !== actualImage.width || expectedImage.height !== actualImage.height) {
    throw new Error(
      `size mismatch: expected ${expectedImage.width}x${expectedImage.height}, got ${actualImage.width}x${actualImage.height}`,
    );
  }
  const { width, height } = expectedImage;

  const expectedCanvas = createCanvas(width, height);
  const expectedCtx = expectedCanvas.getContext('2d');
  expectedCtx.drawImage(expectedImage, 0, 0);
  const expectedData = expectedCtx.getImageData(0, 0, width, height).data;

  const actualCanvas = createCanvas(width, height);
  const actualCtx = actualCanvas.getContext('2d');
  actualCtx.drawImage(actualImage, 0, 0);
  const actualData = actualCtx.getImageData(0, 0, width, height).data;

  const diffCanvas = createCanvas(width, height);
  const diffCtx = diffCanvas.getContext('2d');
  const diffImageData = diffCtx.createImageData(width, height);

  let channelDiffSum = 0;
  let pixelsOver8 = 0;
  let maxChannelDiff = 0;
  const pixelCount = width * height;

  for (let i = 0; i < expectedData.length; i += 4) {
    let pixelMax = 0;
    for (let channel = 0; channel < 4; channel++) {
      const expectedValue = expectedData[i + channel] ?? 0;
      const actualValue = actualData[i + channel] ?? 0;
      const diff = Math.abs(expectedValue - actualValue);
      channelDiffSum += diff;
      if (diff > pixelMax) pixelMax = diff;
      if (diff > maxChannelDiff) maxChannelDiff = diff;
    }
    if (pixelMax > PER_CHANNEL_DIFF_FLOOR) pixelsOver8++;
    const amplified = Math.min(255, pixelMax * 4);
    diffImageData.data[i] = amplified;
    diffImageData.data[i + 1] = 0;
    diffImageData.data[i + 2] = 0;
    diffImageData.data[i + 3] = pixelMax > 0 ? 255 : 32;
  }
  diffCtx.putImageData(diffImageData, 0, 0);

  return {
    width,
    height,
    meanAbsDiff: channelDiffSum / (pixelCount * 4),
    pctPixelsOver8: (100 * pixelsOver8) / pixelCount,
    maxChannelDiff,
    diffPng: await diffCanvas.encode('png'),
  };
}

/**
 * `effectiveSizePt` is the *rendered* box's shorter side in points (not the nominal `size`
 * attribute): a non-square icon like `squiggle` (viewBox 100x20) at `size=96` renders at
 * 96x19.2pt, just as AA-sensitive as a truly small icon, so callers pass `min(w, h)` from
 * `layout()` rather than the raw size.
 */
export function isWithinThreshold(result: DiffResult, effectiveSizePt: number): boolean {
  const meanAbsThreshold =
    effectiveSizePt <= SMALL_SIZE_MAX_PT ? SMALL_SIZE_MEAN_ABS_DIFF_THRESHOLD : MEAN_ABS_DIFF_THRESHOLD;
  const pctOver8Threshold =
    effectiveSizePt <= SMALL_SIZE_MAX_PT
      ? SMALL_SIZE_PIXELS_OVER_8_PCT_THRESHOLD
      : PIXELS_OVER_8_PCT_THRESHOLD;
  return result.meanAbsDiff < meanAbsThreshold && result.pctPixelsOver8 < pctOver8Threshold;
}
