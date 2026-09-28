/**
 * A join link as a QR code: the module grid from `uqr` (pure JS, no native code) turned into one
 * SVG path, a horizontal run of dark modules per segment, for Skia to fill. Error correction M and
 * a four-module quiet zone, so phone cameras read it off another screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SVG path commands and a link query, never copy. */
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

/** A share link tagged as reaching its reader through a scanned QR code (`?c=qr`). */
export function qrChannelLink(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}c=qr`;
}
