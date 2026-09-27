import type { Canvas } from '@napi-rs/canvas';
import { createCanvas } from '@napi-rs/canvas';
import type { Page } from 'playwright';

import { renderToCanvas, viewportFor } from '../src/backends/canvas2d/index';
import type { CanvasFactory, CanvasLike } from '../src/backends/canvas2d/render';
import { frame } from '../src/core/frame';
import { layout } from '../src/core/layout';
import type { FormSpec, RenderSpec } from '../src/core/model';
import { build } from '../src/core/model';
import type { EdgeRingStyle } from '../src/forms/tier-palette';
import { EDGE_RING_STYLES } from '../src/forms/tier-palette';
import { comparePngBuffers } from './diff';

// The two tier-edge rings the design mockups actually author in CSS (`Critterpass.dc.html`'s
// "TOKEK'S FORMS" widget and the Sakura Pon hero screen): a wrapper `filter: drop-shadow` stack of 4
// cardinal-offset copies, which dilates the sticker silhouette outward by a fixed number of CSS
// pixels in a "plus" shape. `forms/tier-palette.ts` instead draws a uniform round-joined stroke ring,
// since a canvas-only core can't reproduce a multi-copy CSS filter -- the two shapes are
// geometrically different by construction (a round ring covers the diagonals between cardinal points
// that the CSS plus-shape does not), so this check measures and records how far they diverge rather
// than asserting pixel parity; closing that gap is a founder gallery-review call, not a stricter
// threshold here.
export interface EdgeRingFixture {
  readonly name: string;
  readonly designAttrs: Readonly<Record<string, string>>;
  readonly form: FormSpec;
}

export const EDGE_RING_FIXTURES: readonly EdgeRingFixture[] = [
  {
    name: 'epic-tokek',
    designAttrs: {
      kind: 'gecko',
      size: '96',
      seed: '7',
      anim: 'none',
      blink: 'false',
      sticker: '#f4efe4',
      fill: '#ff9a4d',
      spot: '#c4623e',
      pose: 'cheer',
    },
    form: {
      rarity: 'epic',
      palette: { f: '#ff9a4d', dk: '#c4623e', bl: '#ff9a4d' },
      pose: 'cheer',
      edge: 'epic',
    },
  },
  {
    name: 'sakura-pon',
    designAttrs: {
      kind: 'tanuki',
      size: '96',
      seed: '7',
      anim: 'none',
      blink: 'false',
      sticker: '#f4efe4',
      fill: '#ffc2d9',
      spot: '#c94f86',
      belly: '#fff1f6',
      pose: 'cheer',
    },
    form: {
      rarity: 'legendary',
      palette: { f: '#ffc2d9', dk: '#c94f86', bl: '#fff1f6' },
      pose: 'cheer',
      edge: 'legendary',
    },
  },
];

/** Both fixtures carry a tier edge by construction; reused from `forms/tier-palette.ts` rather than a second copy of the offset/colour constants. */
function ringStyleFor(edge: FormSpec['edge']): EdgeRingStyle {
  if (edge === 'none') throw new Error('edge-ring fixtures must have a tier edge');
  return EDGE_RING_STYLES[edge];
}

const ART_PX = 96;
/** Comfortably beyond the largest ring offset (3px) plus round-join/AA slack at the silhouette corners. */
const MARGIN_PX = 16;
const BOX_PX = ART_PX + 2 * MARGIN_PX;

/**
 * Sanity ceiling only (not a fidelity threshold): catches a blank canvas, a crashed render, or a
 * totally wrong colour — not whether the ring shape matches, which is expected to differ (see above).
 */
export const EDGE_RING_SANITY_MAX_PCT = 70;

const nodeCanvasFactory: CanvasFactory = (width, height) =>
  createCanvas(width, height) as unknown as CanvasLike;

/** Renders `fixture`'s designed form through our own core, composed onto a `BOX_PX`-square transparent canvas so it lines up with the CSS reference's own padding. */
async function renderCoreEdgeRingPng(fixture: EdgeRingFixture): Promise<Buffer> {
  const spec: RenderSpec = {
    kind: fixture.designAttrs.kind ?? '',
    seed: 7,
    sticker: { color: '#f4efe4' },
    form: fixture.form,
  };
  const model = build(spec, ART_PX);
  const boxLayout = layout(spec, ART_PX);
  const viewport = viewportFor(boxLayout, 1);
  const artCanvas = renderToCanvas(
    frame(model, 1),
    viewport,
    nodeCanvasFactory,
  ) as unknown as Canvas;

  const composed = createCanvas(BOX_PX, BOX_PX);
  const ctx = composed.getContext('2d');
  const offsetX = Math.round((BOX_PX - artCanvas.width) / 2);
  const offsetY = Math.round((BOX_PX - artCanvas.height) / 2);
  ctx.drawImage(artCanvas, offsetX, offsetY);
  return await composed.encode('png');
}

// `page.evaluate` callbacks are re-parsed and run inside Chromium, where `harness.html`'s
// `__edgeRingWrap` provides this — declared locally rather than adding the `dom` lib package-wide.
declare const window: {
  __edgeRingWrap: (
    attrs: Record<string, string>,
    ringOffsetPx: number,
    ringColor: string,
    boxPx: number,
    artPx: number,
  ) => void;
};

/** Renders the untouched design's CSS 4-offset ring around `fixture`'s `<doodle-art>`, screenshotting the wrapper element (real Chromium compositing, incl. the `filter`). */
async function renderCssEdgeRingPng(page: Page, fixture: EdgeRingFixture): Promise<Buffer> {
  const ringStyle = ringStyleFor(fixture.form.edge);
  const ringOffsetPx = ringStyle.width;
  const ringColor = ringStyle.color;
  await page.evaluate(
    (args: {
      attrs: Record<string, string>;
      ringOffsetPx: number;
      ringColor: string;
      boxPx: number;
      artPx: number;
    }) =>
      window.__edgeRingWrap(args.attrs, args.ringOffsetPx, args.ringColor, args.boxPx, args.artPx),
    { attrs: { ...fixture.designAttrs }, ringOffsetPx, ringColor, boxPx: BOX_PX, artPx: ART_PX },
  );
  return await page.locator('#edge-ring-wrap').screenshot({ omitBackground: true });
}

export interface EdgeRingResult {
  readonly name: string;
  readonly meanAbsDiff: number;
  readonly pctPixelsOver8: number;
  readonly sane: boolean;
  readonly diffPng: Buffer;
}

/** Compares one designed form's CSS-authored edge ring against our own round-ring rendering; see the module doc comment for why this reports rather than gates. */
export async function runEdgeRingCase(
  page: Page,
  fixture: EdgeRingFixture,
): Promise<EdgeRingResult> {
  const expected = await renderCssEdgeRingPng(page, fixture);
  const actual = await renderCoreEdgeRingPng(fixture);
  const diff = await comparePngBuffers(expected, actual);
  return {
    name: fixture.name,
    meanAbsDiff: diff.meanAbsDiff,
    pctPixelsOver8: diff.pctPixelsOver8,
    sane: diff.pctPixelsOver8 < EDGE_RING_SANITY_MAX_PCT,
    diffPng: diff.diffPng,
  };
}
