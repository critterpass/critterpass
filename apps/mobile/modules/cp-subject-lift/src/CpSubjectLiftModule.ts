import { NativeModule, requireOptionalNativeModule } from 'expo';

/** What `lift` reports: the cut-out file when a subject was found. */
export type NativeLiftResult =
  | { readonly found: false }
  | { readonly found: true; readonly uri: string; readonly width: number; readonly height: number };

export interface NativePreparedPng {
  readonly uri: string;
  readonly sha256: string;
  readonly byteLength: number;
}

/**
 * The native binding (Swift `CpSubjectLiftModule` / Kotlin `CpSubjectLiftModule`).
 * `requireOptionalNativeModule` resolves to `null` in a build without it (Jest, or a binary built
 * before the module existed); the real-photo option is then not offered.
 */
export declare class NativeCpSubjectLiftModule extends NativeModule {
  /** Whether this device can segment (iOS device, Android with Google Play services). */
  isSupported(): boolean;
  lift(uri: string): Promise<NativeLiftResult>;
  prepare(uri: string, cutout: boolean, zoom: number, size: number): Promise<NativePreparedPng>;
}

export const nativeCpSubjectLiftModule =
  requireOptionalNativeModule<NativeCpSubjectLiftModule>('CpSubjectLift');
