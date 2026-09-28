/**
 * On-device subject lift for photo avatars: a photo becomes a cut-out PNG with alpha cropped to
 * its subject (iOS Vision foreground instance mask, Android ML Kit subject segmentation), and
 * `prepare` lays the square avatar PNG that gets uploaded: the cut-out inside room for its sticker
 * outline, or the photo clipped to a circle when no subject was found.
 */
import {
  nativeCpSubjectLiftModule,
  type NativeCpSubjectLiftModule,
} from './src/CpSubjectLiftModule';

/** The uploaded avatar's side in pixels; the worker renders the 40–240 px variants from it. */
export const AVATAR_PNG_SIZE = 512;

export interface LiftedSubject {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface PreparedPng {
  readonly uri: string;
  /** Lowercase hex SHA-256 of the PNG bytes (the presign checksum). */
  readonly sha256: string;
  readonly byteLength: number;
}

export interface SubjectLiftApi {
  /** False where the device cannot segment: every photo then takes the circle crop. */
  readonly canLift: boolean;
  /** The cut-out, or null when the photo has no subject. */
  lift(uri: string): Promise<LiftedSubject | null>;
  /** `zoom` ≥ 1 crops tighter on the centre. */
  prepare(
    uri: string,
    options: { readonly cutout: boolean; readonly zoom: number; readonly size?: number },
  ): Promise<PreparedPng>;
}

export function fromNativeModule(native: NativeCpSubjectLiftModule): SubjectLiftApi {
  return {
    canLift: native.isSupported(),
    async lift(uri) {
      const result = await native.lift(uri);
      return result.found ? { uri: result.uri, width: result.width, height: result.height } : null;
    },
    prepare: (uri, { cutout, zoom, size = AVATAR_PNG_SIZE }) =>
      native.prepare(uri, cutout, Math.max(1, zoom), size),
  };
}

let shared: SubjectLiftApi | null = null;

/** Null in a binary built without the module: the real-photo option is then not offered. */
export function getSubjectLift(): SubjectLiftApi | null {
  if (nativeCpSubjectLiftModule === null) return null;
  shared ??= fromNativeModule(nativeCpSubjectLiftModule);
  return shared;
}
