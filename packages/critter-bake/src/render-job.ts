import type { Canvas } from '@napi-rs/canvas';
import { createCanvas } from '@napi-rs/canvas';
import type { Critter, RenderSpec } from '@cp/critter-art';
import { build, canonicalSeed, critters, findDesignedForm, frame, layout } from '@cp/critter-art';
import { renderToCanvas, viewportFor } from '@cp/critter-art/canvas2d';
import type { CanvasFactory, CanvasLike } from '@cp/critter-art/canvas2d';

import type {
  BakeCrop,
  BakeFormat,
  BakePose,
  BakeTarget,
  BakeVariant,
  RarityForm,
} from './manifest';
import { encodeCanvas } from './encode';

/** One concrete file this pipeline will render — the fully expanded cross product of one manifest target. */
export interface RenderJob {
  readonly outPath: string;
  readonly renderSpec: RenderSpec;
  readonly variant: BakeVariant;
  readonly sizePt: number;
  readonly scale: number;
  readonly crop: BakeCrop;
  readonly bg: string | undefined;
  readonly format: BakeFormat;
}

/** A rendered output: usually one file per job, three for `variant: 'blur'` (its blur stages). `sourceJobOutPath` always equals the originating `RenderJob.outPath` (even for a blur stage's own, different `outPath`), so callers can look outputs back up by job without guessing at the blur-stage filename suffix. */
export interface RenderOutput {
  readonly outPath: string;
  readonly sourceJobOutPath: string;
  readonly bytes: Uint8Array;
}

// Gaussian-ish blur stages baked for the critter-nearby proximity effect (5a-4): progressively
// blurrier silhouettes. Sigma values are a founder-reviewable default (no design source gives the
// exact radii) chosen to read as "distant / nearer / about-to-arrive".
const BLUR_STAGE_SIGMAS: readonly number[] = [2, 5, 10];

function resolveCritterByKind(kind: string): Critter | undefined {
  return critters.find((c) => c.kind === kind || c.id === kind);
}

function resolveKindsForTarget(target: BakeTarget): readonly string[] {
  if (target.kind === 'all') return critters.map((c) => c.kind);
  return Array.isArray(target.kind) ? target.kind : [target.kind];
}

/**
 * Resolves one (kind, rarity) pair to a `RenderSpec`, or `undefined` when no content exists for it
 * yet (per the phase's non-code dependency: "ship tier A bakes forms present in packages/content" —
 * this pipeline never fabricates a palette for a form nobody has designed).
 */
function resolveRenderSpecForForm(
  kind: string,
  rarity: RarityForm,
  pose: BakePose,
  variant: BakeVariant,
): RenderSpec | undefined {
  const critter = resolveCritterByKind(kind);
  const seed = critter ? canonicalSeed(critter) : 7;
  const specVariant = variant === 'blur' ? 'mask' : variant;

  let form: RenderSpec['form'];
  if (rarity !== 'common') {
    if (!critter) return undefined;
    const designed = findDesignedForm(critter.id, rarity);
    if (!designed) return undefined;
    form = designed.form;
  }

  return {
    kind,
    seed,
    ...(form ? { form } : {}),
    pose,
    variant: specVariant,
  };
}

function formatSuffix(sizePt: number, scale: number, ext: string): string {
  return `-${sizePt}pt@${scale}x.${ext}`;
}

function extensionFor(format: BakeFormat): string {
  if (format === 'vector-drawable') return 'xml';
  return format;
}

/** Expands every manifest target into concrete render jobs, skipping (kind, rarity) pairs with no designed form. */
export function expandManifest(targets: readonly BakeTarget[]): RenderJob[] {
  const jobs: RenderJob[] = [];
  for (const target of targets) {
    const kinds = resolveKindsForTarget(target);
    const ext = extensionFor(target.format);
    for (const kind of kinds) {
      for (const rarity of target.forms) {
        for (const pose of target.poses) {
          for (const variant of target.variants) {
            const renderSpec = resolveRenderSpecForForm(kind, rarity, pose, variant);
            if (!renderSpec) continue;
            for (const sizePt of target.sizesPt) {
              for (const scale of target.scales) {
                const base = `${kind}-${rarity}-${pose}-${variant}`;
                const outPath = `${target.out}/${base}${formatSuffix(sizePt, scale, ext)}`;
                jobs.push({
                  outPath,
                  renderSpec,
                  variant,
                  sizePt,
                  scale,
                  crop: target.crop,
                  bg: target.bg,
                  format: target.format,
                });
              }
            }
          }
        }
      }
    }
  }
  return jobs;
}

function applyBackground(canvas: Canvas, bg: string | undefined): Canvas {
  if (!bg) return canvas;
  const composed = createCanvas(canvas.width, canvas.height);
  const ctx = composed.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(canvas, 0, 0);
  return composed;
}

/**
 * Crops the rendered art per the manifest's `crop`. `'circle'` clips the full frame to a centred
 * circle; `'face'` additionally crops to the top ~68% of the frame first (a founder-reviewable
 * default for "face" framing — the design source gives no exact avatar crop box) before the
 * circular clip, matching a notification-avatar composition.
 */
function applyCrop(canvas: Canvas, crop: BakeCrop): Canvas {
  if (crop === 'none') return canvas;

  const size = Math.min(canvas.width, canvas.height);
  const source: { readonly sx: number; readonly sy: number; readonly s: number } =
    crop === 'face'
      ? { sx: (canvas.width - size) / 2, sy: 0, s: size * 0.68 }
      : { sx: (canvas.width - size) / 2, sy: (canvas.height - size) / 2, s: size };

  const out = createCanvas(size, size);
  const ctx = out.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(canvas, source.sx, source.sy, source.s, source.s, 0, 0, size, size);
  ctx.restore();
  return out;
}

/** Deterministic box-blur approximation of a Gaussian blur (3 passes), applied in place on RGBA pixel data. */
function boxBlur(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  for (let pass = 0; pass < 3; pass++) {
    const copy = Uint8ClampedArray.from(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r0 = 0;
        let g0 = 0;
        let b0 = 0;
        let a0 = 0;
        let count = 0;
        for (let dy = -r; dy <= r; dy++) {
          const sy = y + dy;
          if (sy < 0 || sy >= height) continue;
          for (let dx = -r; dx <= r; dx++) {
            const sx = x + dx;
            if (sx < 0 || sx >= width) continue;
            const i = (sy * width + sx) * 4;
            r0 += copy[i] ?? 0;
            g0 += copy[i + 1] ?? 0;
            b0 += copy[i + 2] ?? 0;
            a0 += copy[i + 3] ?? 0;
            count++;
          }
        }
        const o = (y * width + x) * 4;
        data[o] = r0 / count;
        data[o + 1] = g0 / count;
        data[o + 2] = b0 / count;
        data[o + 3] = a0 / count;
      }
    }
  }
}

function blurCanvas(canvas: Canvas, sigma: number): Canvas {
  const out = createCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  boxBlur(imageData.data, canvas.width, canvas.height, sigma);
  ctx.putImageData(imageData, 0, 0);
  return out;
}

/** Renders one job's art to a full-size `Canvas` (before crop/bg/blur/encode) — deterministic given `renderSpec`, `sizePt` and `scale`. */
function renderArt(job: RenderJob): Canvas {
  const boxLayout = layout(job.renderSpec, job.sizePt);
  const model = build(job.renderSpec, job.sizePt);
  const cmds = frame(model, 1);
  const viewport = viewportFor(boxLayout, job.scale);
  const factory = ((w: number, h: number) => createCanvas(w, h)) as unknown as CanvasFactory;
  return renderToCanvas(cmds, viewport, factory) as unknown as Canvas;
}

/** Renders and encodes one job — the pure, worker-safe unit of work (no filesystem writes). */
export async function renderJob(job: RenderJob): Promise<RenderOutput[]> {
  const isBlur = job.variant === 'blur';
  let canvas = renderArt(job);
  canvas = applyCrop(canvas, job.crop);
  canvas = applyBackground(canvas, job.bg);

  if (!isBlur) {
    const bytes = await encodeCanvas(canvas, job.format);
    return [{ outPath: job.outPath, sourceJobOutPath: job.outPath, bytes }];
  }

  const outputs: RenderOutput[] = [];
  for (let stage = 0; stage < BLUR_STAGE_SIGMAS.length; stage++) {
    const sigma = BLUR_STAGE_SIGMAS[stage] ?? 1;
    const blurred = blurCanvas(canvas, sigma * job.scale);
    const bytes = await encodeCanvas(blurred, job.format);
    outputs.push({
      outPath: job.outPath.replace(/(\.[a-z-]+)$/, `-stage${stage + 1}$1`),
      sourceJobOutPath: job.outPath,
      bytes,
    });
  }
  return outputs;
}

export type { CanvasLike };
