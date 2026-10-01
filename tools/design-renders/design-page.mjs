// Chromium pages that render design/*.dc.html at an export scale (see export-app-icons.mjs).
/* global window, customElements -- page callbacks run in the browser */

// The doodle canvases cap their backing store at 2.5x CSS pixels (`Math.min(2, devicePixelRatio)`);
// lift the cap to the export scale so a 1024 px icon is drawn at full resolution, not upscaled.
// During setup the ratio reads as a marker value no stroke maths can produce, so only that one call
// is lifted.
function liftDoodleResolutionCap(cap) {
  const define = customElements.define.bind(customElements);
  customElements.define = (name, ctor, options) => {
    if (name === 'doodle-art') {
      const setup = ctor.prototype.setup;
      ctor.prototype.setup = function setupAtExportScale() {
        const marker = cap + 1e-9;
        const ratio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
        const min = Math.min;
        Object.defineProperty(window, 'devicePixelRatio', {
          configurable: true,
          get: () => marker,
        });
        Math.min = (a, ...rest) =>
          a === 2 && rest.length === 1 && rest[0] === marker ? marker : min(a, ...rest);
        try {
          return setup.call(this);
        } finally {
          Math.min = min;
          if (ratio) Object.defineProperty(window, 'devicePixelRatio', ratio);
          else delete window.devicePixelRatio;
        }
      };
    }
    define(name, ctor, options);
  };
}

/** A browser context at the export scale, optionally serving `html` at /__export.html. */
export async function openPage(browser, server, scale, html) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    deviceScaleFactor: scale,
  });
  await context.addInitScript(liftDoodleResolutionCap, scale);
  const page = await context.newPage();
  // A design script error would export a half-drawn icon; fail the run instead.
  page.on('pageerror', (error) => {
    console.error(`design page error: ${error.message}`);
    process.exitCode = 1;
  });
  if (html) {
    await page.route(`${server.origin}/__export.html`, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
    );
  }
  return { context, page };
}
