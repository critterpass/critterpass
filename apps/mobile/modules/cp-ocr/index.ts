/**
 * On-device receipt OCR. The platform recogniser (iOS Vision, Android ML Kit text recognition v2)
 * reports raw lines and image signals; this layer puts the lines in reading order with stable ids
 * `l{index}`, names the one quality problem worth a retake, and maps a script the device cannot
 * read to `unsupported_script` so the server transcribes the photo. Barcodes (boarding passes,
 * e-tickets) and the platform document scanner ride along.
 */
import { nativeCpOcrModule, type NativeCpOcrModule } from './src/CpOcrModule';
import { orderLines } from './src/order-lines';
import { classifyQuality } from './src/quality';
import { languageHints } from './src/scripts';
import type { BarcodeFormat, OcrApi, OcrBox, RawOcrLine, ScannedBarcode } from './src/types';

export type {
  BarcodeFormat,
  DocumentScan,
  OcrApi,
  OcrLine,
  OcrQualityIssue,
  OcrQualitySignals,
  OcrResult,
  OcrStatus,
  ScannedBarcode,
} from './src/types';
export { orderLines } from './src/order-lines';
export { classifyQuality, QUALITY_THRESHOLDS } from './src/quality';

/** The document scanner's default: one receipt is one page. */
export const DEFAULT_PAGE_LIMIT = 1;

const BARCODE_FORMATS: ReadonlySet<string> = new Set<BarcodeFormat>(['pdf417', 'aztec', 'qr']);

/** A signal the device did not report stays NaN, which never raises a quality issue. */
const signal = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN);

function toBox(bbox: readonly number[]): OcrBox {
  const [x = 0, y = 0, w = 0, h = 0] = bbox;
  return [x, y, w, h];
}

export function fromNativeModule(native: NativeCpOcrModule): OcrApi {
  return {
    async recognize(imageUri, options) {
      const hints = languageHints(options?.languages ?? []);
      const raw = await native.recognize(
        imageUri,
        hints.map((hint) => hint.language),
        hints.map((hint) => hint.script),
      );
      const signals = {
        blur: signal(raw.signals.blur),
        glare: signal(raw.signals.glare),
        curvature: signal(raw.signals.curvature),
        clipped: signal(raw.signals.clipped),
      };
      const lines =
        raw.status === 'ok'
          ? orderLines(
              raw.observations.map((o): RawOcrLine => ({
                text: o.text,
                bbox: toBox(o.bbox),
                conf: o.conf,
              })),
            )
          : [];
      const status =
        raw.status === 'unsupported_script'
          ? 'unsupported_script'
          : lines.length
            ? 'ok'
            : 'no_text';
      return {
        status,
        lines,
        signals,
        quality: classifyQuality(signals),
        width: raw.width,
        height: raw.height,
      };
    },
    async scanBarcode(imageUri) {
      const found = await native.scanBarcode(imageUri);
      return found.filter(
        (code): code is ScannedBarcode => BARCODE_FORMATS.has(code.format) && code.value.length > 0,
      );
    },
    async scanDocument(options) {
      const limit = Math.max(1, Math.floor(options?.pageLimit ?? DEFAULT_PAGE_LIMIT));
      const scan = await native.scanDocument(limit);
      if (scan.status === 'cancelled' || scan.uris.length === 0) return { status: 'cancelled' };
      return { status: 'captured', uris: scan.uris.slice(0, limit) };
    },
  };
}

let shared: OcrApi | null = null;

/** Null in a build without the native module: the scan screen then offers manual entry only. */
export function getOcr(): OcrApi | null {
  if (nativeCpOcrModule === null) return null;
  shared ??= fromNativeModule(nativeCpOcrModule);
  return shared;
}
