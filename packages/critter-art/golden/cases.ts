// Golden case matrix: guides + icons (design/doodles.js's own K registry) plus every local critter
// (all 15 design/critters-draw-1/2.js archetypes are registered in src/kinds/locals/register.ts).
import { critters } from '../src/data/critters';
import { isGuideSpec } from '../src/data/types';

export const GUIDE_KINDS = ['gecko', 'tanuki', 'puffin', 'axolotl', 'sardine', 'alpaca'] as const;

export const ICON_KINDS = [
  'egg',
  'star',
  'flame',
  'lock',
  'chat',
  'cal',
  'pin',
  'bed',
  'ticket',
  'boat',
  'wallet',
  'bell',
  'sun',
  'rain',
  'spark',
  'plane',
  'car',
  'volcano',
  'wave',
  'temple',
  'camera',
  'food',
  'check',
  'heart',
  'underline',
  'circle',
  'arrow',
  'squiggle',
] as const;

export type Variant = 'plain' | 'sticker' | 'locked' | 'source-over';

export const SIZES_PT = [24, 96, 300] as const;
export const DRAW_ON_PROGRESSES = [0.15, 0.5, 0.85, 1] as const;

/** Kinds exercised at every size/variant/draw-on/blink combination, to validate the pipeline's dimensions. */
const DEEP_DIVE_KINDS = ['gecko', 'tanuki', 'heart'] as const;

const STICKER_COLOR = '#f4efe4';
const LOCKED_COLOR = '#3a3466';

export interface GoldenCase {
  readonly id: string;
  readonly kind: string;
  readonly sizePt: number;
  readonly variant: Variant;
  readonly p: number;
  readonly blink: boolean;
  readonly seed: number;
}

function isGuide(kind: string): boolean {
  return (GUIDE_KINDS as readonly string[]).includes(kind);
}

function caseId(kind: string, sizePt: number, variant: Variant, p: number, blink: boolean): string {
  return `${kind}-${sizePt}pt-${variant}-p${p}${blink ? '-blink' : ''}`;
}

/**
 * Builds the golden case matrix: a size=96pt/plain/p=1 baseline for every guide and icon (so every
 * kind's own geometry is checked), plus the full sizes x variants x draw-on x blink cross product
 * for a few representative kinds (the variant/draw-on/blink machinery is kind-independent, so
 * repeating it for all 34 kinds would not add coverage, only runtime).
 */
export function buildCaseMatrix(): GoldenCase[] {
  const cases: GoldenCase[] = [];
  const allKinds: readonly string[] = [...GUIDE_KINDS, ...ICON_KINDS];

  for (const kind of allKinds) {
    cases.push({ id: caseId(kind, 96, 'plain', 1, false), kind, sizePt: 96, variant: 'plain', p: 1, blink: false, seed: 7 });
  }

  for (const kind of DEEP_DIVE_KINDS) {
    for (const sizePt of SIZES_PT) {
      for (const variant of ['plain', 'sticker', 'locked', 'source-over'] as const) {
        for (const p of DRAW_ON_PROGRESSES) {
          cases.push({ id: caseId(kind, sizePt, variant, p, false), kind, sizePt, variant, p, blink: false, seed: 7 });
        }
      }
      if (isGuide(kind)) {
        cases.push({ id: caseId(kind, sizePt, 'plain', 1, true), kind, sizePt, variant: 'plain', p: 1, blink: true, seed: 7 });
      }
    }
  }

  // Locals: 24/96/300pt x common/sticker/locked, fully drawn, seeded with the critter's own `no`
  // (design's `c.no`, the documented default canonical seed for locals — see the phase's open
  // questions). No draw-on/blink sweep here: that machinery is already validated kind-independently
  // by DEEP_DIVE_KINDS above.
  for (const critter of critters) {
    if (isGuideSpec(critter.spec)) continue;
    for (const sizePt of SIZES_PT) {
      for (const variant of ['plain', 'sticker', 'locked'] as const) {
        cases.push({
          id: caseId(critter.id, sizePt, variant, 1, false),
          kind: critter.id,
          sizePt,
          variant,
          p: 1,
          blink: false,
          seed: critter.no,
        });
      }
    }
  }

  return cases;
}

export interface DesignAttrs {
  readonly kind: string;
  readonly size: string;
  readonly seed: string;
  readonly anim: string;
  readonly blink?: string;
  readonly sticker?: string;
  readonly locked?: string;
  readonly blend?: string;
}

/** Maps a golden case to the `<doodle-art>` attributes the untouched design element reads. */
export function caseToDesignAttrs(goldenCase: GoldenCase): DesignAttrs {
  const base: DesignAttrs = {
    kind: goldenCase.kind,
    size: String(goldenCase.sizePt),
    seed: String(goldenCase.seed),
    anim: 'none',
  };
  if (goldenCase.variant === 'sticker') return { ...base, sticker: STICKER_COLOR };
  if (goldenCase.variant === 'locked') return { ...base, locked: LOCKED_COLOR };
  if (goldenCase.variant === 'source-over') return { ...base, blend: 'source-over' };
  return base;
}

export interface CoreCaseSpec {
  readonly kind: string;
  readonly seed: number;
  readonly sticker?: { readonly color: string };
  readonly variant?: 'mask';
  readonly maskColor?: string;
  readonly blend?: 'srcOver';
  readonly closedEyes?: boolean;
}

/** Maps a golden case to the core's `RenderSpec` (as plain data — the actual `RenderSpec` type is defined in `src/core/model.ts`). */
export function caseToCoreSpec(goldenCase: GoldenCase): CoreCaseSpec {
  const base: CoreCaseSpec = { kind: goldenCase.kind, seed: goldenCase.seed };
  if (goldenCase.variant === 'sticker') return { ...base, sticker: { color: STICKER_COLOR } };
  if (goldenCase.variant === 'locked') return { ...base, variant: 'mask', maskColor: LOCKED_COLOR };
  if (goldenCase.variant === 'source-over') return { ...base, blend: 'srcOver' };
  return base;
}
