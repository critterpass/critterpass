import type { Canvas } from '@napi-rs/canvas';
import { createCanvas } from '@napi-rs/canvas';
import { build as esbuildBundle } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from 'playwright';
import { chromium } from 'playwright';

import { renderToCanvas, viewportFor } from '../src/backends/canvas2d/index';
import type { CanvasFactory, CanvasLike } from '../src/backends/canvas2d/render';
import { frame } from '../src/core/frame';
import { layout } from '../src/core/layout';
import type { RenderSpec } from '../src/core/model';
import { build } from '../src/core/model';
import type { CoreCaseSpec, DesignAttrs, GoldenCase } from './cases';
import { buildCaseMatrix, caseToCoreSpec, caseToDesignAttrs } from './cases';
import { comparePngBuffers, isWithinThreshold } from './diff';
import type { EdgeRingResult } from './edge-ring';
import { EDGE_RING_FIXTURES, runEdgeRingCase } from './edge-ring';

// `page.evaluate` callbacks below are re-parsed and run inside Chromium, where the real `window`
// (from harness.html / the bundled reference-page.js) provides these — declared locally instead of
// adding the `dom` lib to this package's tsconfig, which must stay DOM-free outside the backend.
declare const window: {
  __designRender: (attrs: DesignAttrs, p: number, useClosed: boolean) => string;
  __coreRender: (spec: RenderSpec, sizePt: number, p: number, deviceScale: number) => string;
};

const repoRoot = new URL('../../../', import.meta.url);
const designDir = new URL('design/', repoRoot);
const goldenDir = new URL('.', import.meta.url);
const outDir = new URL('out/', goldenDir);

// Design's `k = Wd*dpr/(vb+2pad)` at `devicePixelRatio: 1` collapses to `min(2,1)*1.25`; the core
// side is told the same real device scale so both sides raster at identical pixel dimensions.
const DEVICE_SCALE = 1.25;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function toRenderSpec(caseSpec: CoreCaseSpec, closedEyes: boolean): RenderSpec {
  return { ...caseSpec, closedEyes };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(',')[1];
  if (base64 === undefined) throw new Error(`not a data URL: ${dataUrl.slice(0, 32)}...`);
  return Buffer.from(base64, 'base64');
}

const nodeCanvasFactory: CanvasFactory = (width, height) =>
  createCanvas(width, height) as unknown as CanvasLike;

async function renderNodeCore(spec: RenderSpec, sizePt: number, p: number): Promise<Buffer> {
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, DEVICE_SCALE);
  const canvas = renderToCanvas(frame(model, p), viewport, nodeCanvasFactory) as unknown as Canvas;
  return await canvas.encode('png');
}

/** Serves `design/<name>` and the bundled `reference-page.js`/`harness.html` for Chromium to load. */
function startServer(referencePageJs: string): Promise<{ origin: string; close: () => void }> {
  const harnessHtml = readFileSync(new URL('harness.html', goldenDir), 'utf8');
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (pathname === '/' || pathname === '/harness.html') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
      response.end(harnessHtml);
      return;
    }
    if (pathname === '/reference-page.js') {
      response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'] });
      response.end(referencePageJs);
      return;
    }
    if (pathname.startsWith('/design/')) {
      try {
        const body = readFileSync(new URL(pathname.slice('/design/'.length), designDir));
        response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'] });
        response.end(body);
        return;
      } catch {
        response.writeHead(404).end();
        return;
      }
    }
    response.writeHead(404).end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

interface ComparisonResult {
  readonly meanAbsDiff: number;
  readonly pctPixelsOver8: number;
  readonly pass: boolean;
}

interface CaseResult {
  readonly id: string;
  readonly browserCore: ComparisonResult;
  readonly nodeCore: ComparisonResult;
  /** Whether `nodeCore.pass` gates the run: the Node backend only ever bakes fully-drawn (p=1) static assets in production (see golden/README.md), so mid-draw-on Node/Chromium Skia blend differences are recorded but not gating. */
  readonly nodeGates: boolean;
}

async function runCase(
  page: Page,
  goldenCase: GoldenCase,
): Promise<{ result: CaseResult; diffs: Array<{ label: string; png: Buffer }> }> {
  const designAttrs = caseToDesignAttrs(goldenCase);
  const coreSpec = toRenderSpec(caseToCoreSpec(goldenCase), goldenCase.blink);

  const designDataUrl = await page.evaluate(
    (args: { attrs: DesignAttrs; p: number; closed: boolean }) =>
      window.__designRender(args.attrs, args.p, args.closed),
    { attrs: designAttrs, p: goldenCase.p, closed: goldenCase.blink },
  );
  const browserDataUrl = await page.evaluate(
    (args: { spec: RenderSpec; sizePt: number; p: number; scale: number }) =>
      window.__coreRender(args.spec, args.sizePt, args.p, args.scale),
    { spec: coreSpec, sizePt: goldenCase.sizePt, p: goldenCase.p, scale: DEVICE_SCALE },
  );
  const expected = dataUrlToBuffer(designDataUrl);
  const browserActual = dataUrlToBuffer(browserDataUrl);
  const nodeActual = await renderNodeCore(coreSpec, goldenCase.sizePt, goldenCase.p);

  const boxLayout = layout(coreSpec, goldenCase.sizePt);
  const effectiveSizePt = Math.min(boxLayout.w, boxLayout.h);
  const browserDiff = await comparePngBuffers(expected, browserActual);
  const nodeDiff = await comparePngBuffers(expected, nodeActual);
  const browserPass = isWithinThreshold(browserDiff, effectiveSizePt);
  const nodePass = isWithinThreshold(nodeDiff, effectiveSizePt);
  const nodeGates = goldenCase.p >= 1;
  const diffs: Array<{ label: string; png: Buffer }> = [];
  if (!browserPass) diffs.push({ label: 'browser', png: browserDiff.diffPng });
  if (!nodePass) diffs.push({ label: 'node', png: nodeDiff.diffPng });

  return {
    result: {
      id: goldenCase.id,
      browserCore: { meanAbsDiff: browserDiff.meanAbsDiff, pctPixelsOver8: browserDiff.pctPixelsOver8, pass: browserPass },
      nodeCore: { meanAbsDiff: nodeDiff.meanAbsDiff, pctPixelsOver8: nodeDiff.pctPixelsOver8, pass: nodePass },
      nodeGates,
    },
    diffs,
  };
}

/** Proves the harness actually catches a regression: a drastically recoloured icon must fail. */
async function verifyMutationSensitivity(): Promise<boolean> {
  const base: RenderSpec = { kind: 'heart', seed: 7 };
  const mutated: RenderSpec = {
    kind: 'heart',
    seed: 7,
    form: { rarity: 'common', palette: { f: '#000', dk: '#000', bl: '#000', accent: '#00ff00' }, edge: 'none' },
  };
  const a = await renderNodeCore(base, 96, 1);
  const b = await renderNodeCore(mutated, 96, 1);
  const diff = await comparePngBuffers(a, b);
  return !isWithinThreshold(diff, 96);
}

async function main(): Promise<void> {
  const bundle = await esbuildBundle({
    entryPoints: [new URL('reference-page.ts', goldenDir).pathname],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2022',
  });
  const output = bundle.outputFiles[0];
  if (!output) throw new Error('esbuild produced no output for reference-page.ts');

  const server = await startServer(output.text);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 1 });
    await page.goto(`${server.origin}/`);

    const cases = buildCaseMatrix();
    const results: CaseResult[] = [];
    mkdirSync(new URL('diffs/', outDir), { recursive: true });

    for (const goldenCase of cases) {
      const { result, diffs } = await runCase(page, goldenCase);
      results.push(result);
      for (const diff of diffs) {
        writeFileSync(new URL(`diffs/${result.id}-${diff.label}.png`, outDir), diff.png);
      }
    }

    const mutationCaught = await verifyMutationSensitivity();
    const failures = results.filter((r) => !r.browserCore.pass || (r.nodeGates && !r.nodeCore.pass));
    const nonGatingNodeMisses = results.filter((r) => !r.nodeGates && !r.nodeCore.pass);

    const edgeRingResults: EdgeRingResult[] = [];
    for (const fixture of EDGE_RING_FIXTURES) {
      const result = await runEdgeRingCase(page, fixture);
      edgeRingResults.push(result);
      writeFileSync(new URL(`diffs/edge-ring-${result.name}.png`, outDir), result.diffPng);
    }
    const insaneEdgeRings = edgeRingResults.filter((r) => !r.sane);

    writeFileSync(
      new URL('report.json', outDir),
      JSON.stringify(
        {
          cases: results,
          mutationCaught,
          failureCount: failures.length,
          nonGatingNodeMissCount: nonGatingNodeMisses.length,
          edgeRings: edgeRingResults.map(({ name, meanAbsDiff, pctPixelsOver8, sane }) => ({
            name,
            meanAbsDiff,
            pctPixelsOver8,
            sane,
          })),
        },
        null,
        2,
      ),
    );

    console.log(`critter-art golden: ${results.length} cases, ${failures.length} failing`);
    console.log(`mutation sensitivity check: ${mutationCaught ? 'caught (pass)' : 'MISSED (fail)'}`);
    console.log(
      `non-gating Node/Chromium misses at p<1 (recorded, not gating — see golden/README.md): ${nonGatingNodeMisses.length}`,
    );
    for (const failure of failures) {
      console.log(
        `  FAIL ${failure.id}: browser meanAbs=${failure.browserCore.meanAbsDiff.toFixed(3)} ` +
          `pct>8=${failure.browserCore.pctPixelsOver8.toFixed(2)}%, node meanAbs=${failure.nodeCore.meanAbsDiff.toFixed(3)} ` +
          `pct>8=${failure.nodeCore.pctPixelsOver8.toFixed(2)}%`,
      );
    }
    console.log('tier edge ring vs design CSS reference (measured, not gated on fidelity — see golden/README.md):');
    for (const edgeRing of edgeRingResults) {
      console.log(
        `  ${edgeRing.name}: meanAbs=${edgeRing.meanAbsDiff.toFixed(3)} pct>8=${edgeRing.pctPixelsOver8.toFixed(2)}% ` +
          `(sanity ${edgeRing.sane ? 'ok' : 'FAILED'})`,
      );
    }

    if (failures.length > 0 || !mutationCaught || insaneEdgeRings.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
