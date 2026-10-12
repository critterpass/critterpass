// Turns the App Icon's `mono` render (dark line art on a light fill, both from the design's themed
// preview) into Android's monochrome layer: the line art as opaque white, the fill transparent.
import { PNG } from 'pngjs';

/** The design's themed-preview colours (`premium/App Icon.dc.html` mono mode: fill and line art). */
const FILL = [0xe2, 0xe7, 0xd0];
const LINE = [0x39, 0x46, 0x1f];

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Alpha for one pixel: 0 at the fill colour, 1 at the line colour, linear between (anti-aliasing). */
export function lineCoverage(r, g, b) {
  const fill = luminance(...FILL);
  const line = luminance(...LINE);
  return Math.min(1, Math.max(0, (fill - luminance(r, g, b)) / (fill - line)));
}

/** @param {Buffer} pngBytes a render with a transparent ground */
export function toMonochrome(pngBytes) {
  const png = PNG.sync.read(pngBytes);
  const { data } = png;
  for (let i = 0; i < data.length; i += 4) {
    const alpha =
      (data[i + 3] ?? 0) * lineCoverage(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.round(alpha);
  }
  return PNG.sync.write(png);
}
