/**
 * Whether a photo's EXIF still carries a GPS position (the device strips it before upload; the
 * server checks again). Reads the TIFF structure sharp hands back as `metadata().exif` and looks for
 * a GPS IFD with any entry in it; anything it cannot read counts as "no GPS block found", since the
 * re-encoded copies never carry metadata anyway.
 */

/** True when `exif` (with or without its `Exif\0\0` prefix) holds a non-empty GPS IFD. */
export function exifHasGps(exif: Uint8Array | undefined): boolean {
  if (exif === undefined || exif.byteLength < 14) return false;
  let start = 0;
  if (String.fromCharCode(...exif.subarray(0, 4)) === 'Exif') start = 6;
  const view = new DataView(exif.buffer, exif.byteOffset + start, exif.byteLength - start);
  if (view.byteLength < 8) return false;
  const order = String.fromCharCode(view.getUint8(0), view.getUint8(1));
  if (order !== 'II' && order !== 'MM') return false;
  const little = order === 'II';
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  try {
    const ifd0 = u32(4);
    const entries = u16(ifd0);
    for (let i = 0; i < entries; i += 1) {
      const entry = ifd0 + 2 + i * 12;
      if (u16(entry) !== 0x8825) continue;
      const gps = u32(entry + 8);
      return gps > 0 && gps + 2 <= view.byteLength && u16(gps) > 0;
    }
  } catch {
    return false;
  }
  return false;
}
