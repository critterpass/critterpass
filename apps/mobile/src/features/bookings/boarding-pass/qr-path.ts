/**
 * A boarding pass or voucher code drawn as a QR code (IATA BCBP allows QR on phones and gate
 * readers take it): the module grid from `uqr` (pure JS, no native code) turned into one SVG path,
 * a horizontal run of dark modules per segment, for Skia to fill. Error correction M and a
 * four-module quiet zone, so a scanner reads it off the screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands, never copy. */
import { encode } from 'uqr';

export interface QrPath {
  /** SVG path in module units, quiet zone included. */
  readonly path: string;
  /** Modules per side, quiet zone included. */
  readonly size: number;
}

export const QR_QUIET_ZONE = 4;

export function qrPath(text: string): QrPath {
  const { data, size } = encode(text, { ecc: 'M', border: QR_QUIET_ZONE });
  const segments: string[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && row[x]) x += 1;
      segments.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return { path: segments.join(''), size };
}
