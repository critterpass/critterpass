import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { OcrQualitySignals } from './types';

/** One line as the platform recogniser reports it (`bbox` normalised, top-left origin). */
export interface NativeOcrObservation {
  readonly text: string;
  readonly bbox: readonly number[];
  readonly conf: number;
}

export interface NativeRecognition {
  /** `unsupported_script`: a hinted script this device cannot read; `observations` is empty. */
  readonly status: 'ok' | 'unsupported_script';
  readonly observations: readonly NativeOcrObservation[];
  readonly signals: OcrQualitySignals;
  readonly width: number;
  readonly height: number;
}

export interface NativeBarcode {
  /** `pdf417`, `aztec` or `qr`; anything else is ignored by the JS side. */
  readonly format: string;
  readonly value: string;
}

export type NativeDocumentScan =
  | { readonly status: 'captured'; readonly uris: readonly string[] }
  | { readonly status: 'cancelled' };

/**
 * The native binding (Swift `CpOcrModule` / Kotlin `CpOcrModule`). `requireOptionalNativeModule`
 * resolves to `null` in a build without it (Jest, or a binary built before the module existed);
 * the scan screen then offers manual entry only.
 */
export declare class NativeCpOcrModule extends NativeModule {
  /** `languages` and `scripts` are parallel: each hint's BCP 47 tag and its writing system. */
  recognize(
    uri: string,
    languages: readonly string[],
    scripts: readonly string[],
  ): Promise<NativeRecognition>;
  scanBarcode(uri: string): Promise<readonly NativeBarcode[]>;
  scanDocument(pageLimit: number): Promise<NativeDocumentScan>;
}

export const nativeCpOcrModule = requireOptionalNativeModule<NativeCpOcrModule>('CpOcr');
