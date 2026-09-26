// Re-renders one screen into a temp dir and pixel-compares it with the committed PNG.
//   pnpm --filter @cp/design-renders run verify:screen -- "3c-9 Pon's draft"
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { renderScreens } from './render-screens.mjs';
import { rendersDir, screenFileName } from './serve-design.mjs';

// pnpm forwards a literal `--` separator; drop it.
const [label = "3c-9 Pon's draft"] = process.argv.slice(2).filter((arg) => arg !== '--');
const outDir = mkdtempSync(path.join(tmpdir(), 'cp-render-'));
const [rendered] = await renderScreens({ only: [label], outDir });
if (!rendered) throw new Error(`screen "${label}" was not rendered`);
const renderedFile = rendered.file;

const expected = PNG.sync.read(
  readFileSync(path.join(rendersDir, 'screens', screenFileName(label))),
);
const actual = PNG.sync.read(readFileSync(renderedFile));
if (expected.width !== actual.width || expected.height !== actual.height) {
  console.log(
    `size differs: ${actual.width}x${actual.height} vs committed ${expected.width}x${expected.height}`,
  );
  process.exit(1);
}
/** Paints animated regions black in both images: their frame depends on when the capture happened. */
function maskBoxes(image, boxes) {
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(image.width, Math.ceil(box.x + box.width));
    const y1 = Math.min(image.height, Math.ceil(box.y + box.height));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (y * image.width + x) * 4;
        image.data[index] = 0;
        image.data[index + 1] = 0;
        image.data[index + 2] = 0;
        image.data[index + 3] = 255;
      }
    }
  }
}
maskBoxes(expected, rendered.animatedBoxes);
maskBoxes(actual, rendered.animatedBoxes);

const diff = new PNG({ width: expected.width, height: expected.height });
const differing = pixelmatch(
  expected.data,
  actual.data,
  diff.data,
  expected.width,
  expected.height,
  { threshold: 0.1 },
);
const ratio = differing / (expected.width * expected.height);
const diffFile = path.join(outDir, 'diff.png');
writeFileSync(diffFile, PNG.sync.write(diff));
console.log(
  `${label}: ${differing} differing pixels (${(ratio * 100).toFixed(3)}%), diff ${diffFile}`,
);
process.exit(ratio <= 0.001 ? 0 : 1);
