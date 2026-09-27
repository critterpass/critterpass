import { renderToCanvas, viewportFor } from '../src/backends/canvas2d/index';
import type { CanvasFactory, CanvasLike } from '../src/backends/canvas2d/render';
import { frame } from '../src/core/frame';
import { layout } from '../src/core/layout';
import { build } from '../src/core/model';
import type { Pose, RenderSpec, Variant } from '../src/core/model';
import type { ArchetypeName, Critter } from '../src/data/types';
import { isGuideSpec } from '../src/data/types';
import { findDesignedForm } from '../src/forms/resolve';

// The pose every archetype/guide reviews best under when no rarity-specific form is authored yet
// (`src/kinds/locals/poses.test.ts` verifies each of these actually differs from the common render
// by > 3% of pixels). `cheer` is design's own pose where it exists (sit, bird, lizard, and 4 of the
// 6 guides); `tilt` is the whole-body transform for the rest.
const ARCHETYPE_EPIC_POSE: Readonly<Record<ArchetypeName, Pose>> = {
  sit: 'cheer',
  stand: 'tilt',
  bird: 'cheer',
  wader: 'tilt',
  fish: 'tilt',
  lizard: 'cheer',
  frog: 'tilt',
  turtle: 'tilt',
  snake: 'tilt',
  bug: 'tilt',
  octo: 'tilt',
  crab: 'tilt',
  seal: 'tilt',
  whale: 'tilt',
  nessie: 'tilt',
};
const GUIDE_EPIC_POSE: Readonly<Record<string, Pose>> = {
  gecko: 'cheer',
  tanuki: 'cheer',
  puffin: 'cheer',
  axolotl: 'cheer',
  sardine: 'tilt',
  alpaca: 'tilt',
};

function defaultPoseFor(critter: Critter): Pose {
  if (isGuideSpec(critter.spec)) return GUIDE_EPIC_POSE[critter.kind] ?? 'tilt';
  return ARCHETYPE_EPIC_POSE[critter.spec.b];
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface GallerySettings {
  readonly rarity: Rarity;
  readonly poseOverride: Pose | null;
  readonly variant: Variant;
  readonly sizePt: number;
  readonly sticker: boolean;
  readonly blink: boolean;
  readonly seedMode: 'design' | 'stable';
}

export interface GalleryCard {
  readonly critter: Critter;
  readonly spec: RenderSpec;
  /** True when `rarity` is rare/epic/legendary but no `DESIGNED_FORMS` fixture exists for this critter -- the palette/edge shown are placeholders (common colours, no edge ring), only the pose preview is real. */
  readonly undesigned: boolean;
}

const STICKER_COLOR = '#f4efe4';

/**
 * Resolves one critter + the toolbar settings into a `RenderSpec`. Never fabricates a palette: a
 * rarity above common only recolours (and shows the die-cut edge ring for) the critters the content
 * factory -- so far just Tokek and Pon -- has actually authored a form for (`forms/designed.ts`).
 * Every other critter still previews its real, generated epic *pose* over its common colours,
 * flagged `undesigned` so a reviewer knows why the colours didn't change.
 */
export function resolveCard(critter: Critter, settings: GallerySettings): GalleryCard {
  const base: RenderSpec = {
    kind: critter.id,
    seed: isGuideSpec(critter.spec) ? 7 : critter.no,
    variant: settings.variant,
    seedMode: settings.seedMode,
    closedEyes: settings.blink,
    ...(settings.sticker ? { sticker: { color: STICKER_COLOR } } : {}),
  };
  if (settings.rarity === 'common') {
    return { critter, spec: base, undesigned: false };
  }
  const designed = findDesignedForm(critter.id, settings.rarity);
  if (designed) {
    return { critter, spec: { ...base, form: designed.form }, undesigned: false };
  }
  if (settings.rarity === 'rare') {
    // Rare never carries a pose (design-system §1.2); with no authored palette there is nothing left
    // to preview for this critter at this rarity.
    return { critter, spec: base, undesigned: true };
  }
  const pose = settings.poseOverride ?? defaultPoseFor(critter);
  return { critter, spec: { ...base, pose }, undesigned: true };
}

const nodeless: CanvasFactory = (width, height): CanvasLike => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
};

/**
 * Renders one card's current model into a fresh canvas at draw-on progress `p`. Always a new
 * element rather than repainting a given one: `renderToCanvas` calls its `CanvasFactory` once per
 * isolated layer (main + outer layer + sticker sub-layer), not once overall, so a factory that
 * hands back the same canvas for every call corrupts the very isolation those layers exist for.
 * Replay (`gallery.ts`) swaps the returned element in for the previous frame's instead.
 */
export function renderCard(spec: RenderSpec, sizePt: number, p: number): HTMLCanvasElement {
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, Math.min(2, window.devicePixelRatio || 1));
  const canvas = renderToCanvas(
    frame(model, p),
    viewport,
    nodeless,
  ) as unknown as HTMLCanvasElement;
  canvas.style.width = `${viewport.widthPx / viewport.deviceScale}px`;
  canvas.style.height = `${viewport.heightPx / viewport.deviceScale}px`;
  return canvas;
}
