export type OcrStatus = 'ok' | 'unsupported_script' | 'no_text';

export type OcrQualityIssue = 'crumpled' | 'blurry' | 'glare' | 'cut_off';

export type OcrBox = readonly [x: number, y: number, w: number, h: number];

/**
 * One recognised line. `id` is `l{index}` in reading order (top to bottom, then left to right);
 * `bbox` is `[x, y, w, h]` normalised 0..1 with a top-left origin on the upright image.
 */
export interface OcrLine {
  readonly id: string;
  readonly text: string;
  readonly bbox: OcrBox;
  readonly conf: number;
}

/** A line as the recogniser reports it, before ordering. */
export interface RawOcrLine {
  text: string;
  bbox: OcrBox;
  conf: number;
}

/**
 * Raw image signals, computed the same way on both platforms:
 * - `blur`: variance of the Laplacian of the downscaled grey image (0..255 grey levels); low is soft.
 * - `glare`: share of pixels blown out to near-white and clearly brighter than the paper (median).
 * - `curvature`: standard deviation, in degrees, of the baselines' angles across the long lines;
 *   a flat page reads as one angle (even when tilted), a crumpled or folded one does not.
 * - `clipped`: share of lines whose box touches an image edge.
 */
export interface OcrQualitySignals {
  readonly blur: number;
  readonly glare: number;
  readonly curvature: number;
  readonly clipped: number;
}

export interface OcrResult {
  readonly status: OcrStatus;
  readonly lines: readonly OcrLine[];
  readonly signals: OcrQualitySignals;
  readonly quality: OcrQualityIssue | null;
  /** The upright image the boxes refer to, in pixels. */
  readonly width: number;
  readonly height: number;
}

export type BarcodeFormat = 'pdf417' | 'aztec' | 'qr';

export interface ScannedBarcode {
  readonly format: BarcodeFormat;
  readonly value: string;
}

export type DocumentScan =
  | { readonly status: 'captured'; readonly uris: readonly string[] }
  | { readonly status: 'cancelled' };

export interface OcrApi {
  recognize(
    imageUri: string,
    options?: { readonly languages?: readonly string[] },
  ): Promise<OcrResult>;
  scanBarcode(imageUri: string): Promise<readonly ScannedBarcode[]>;
  scanDocument(options?: { readonly pageLimit?: number }): Promise<DocumentScan>;
}
