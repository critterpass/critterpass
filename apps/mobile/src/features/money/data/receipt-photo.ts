/**
 * A receipt photo, made small enough to upload: a phone photo (12 MP and more) is scaled so its
 * long edge is at most 2000 px and re-encoded as a JPEG. That is plenty for the server to read a
 * receipt, and keeps it well under the api's 5 MiB single upload. A photo already that small goes
 * up as it is. The device reads its lines from the original; only the upload is shrunk.
 */

/** The longest edge, in pixels, of an uploaded receipt photo. */
export const RECEIPT_MAX_EDGE = 2000;
/** JPEG quality (0–100) of a shrunk photo. */
export const RECEIPT_JPEG_QUALITY = 85;

/** The size `width × height` scales to so neither edge passes `maxEdge` (never upscaled). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The image codec the shrink runs on: Skia on the device, CanvasKit under test. */
export interface PhotoCodec {
  /** The photo's pixel size, or null when the bytes do not decode. */
  size(bytes: Uint8Array): { readonly width: number; readonly height: number } | null;
  /** The photo drawn at `width × height`, as JPEG bytes; null when it could not be encoded. */
  scaledJpeg(bytes: Uint8Array, width: number, height: number, quality: number): Uint8Array | null;
}

/** The bytes to upload: the photo scaled down when it is larger than the limit, else as it is. */
export function shrinkReceiptPhoto(bytes: Uint8Array, codec: PhotoCodec): Uint8Array {
  const size = codec.size(bytes);
  if (size === null) return bytes;
  const fit = fitWithin(size.width, size.height, RECEIPT_MAX_EDGE);
  if (fit.width === size.width && fit.height === size.height) return bytes;
  return codec.scaledJpeg(bytes, fit.width, fit.height, RECEIPT_JPEG_QUALITY) ?? bytes;
}
