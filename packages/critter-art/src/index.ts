// Public API. Math primitives (`src/core/{rng,spline,shapes,ribbon}`) and the op builder
// (`src/core/ops`) stay package-internal — callers only need the pipeline below plus the kind
// registry (populated as guides/icons/locals are ported).
export type {
  Cmd,
  LayerCmd,
  LayerShadow,
  PolyCmd,
  PolylineCmd,
  Blend,
} from './core/cmd';
export type { ArtBox, Layout } from './core/layout';
export { layout } from './core/layout';
export {
  build,
  DEFAULT_INK,
  DEFAULT_LOCKED_COLOR,
} from './core/model';
export type {
  BuiltFillOp,
  BuiltLineOp,
  BuiltOp,
  BuiltUnderOp,
  BuiltWashOp,
  EdgeStyle,
  FormSpec,
  Model,
  Palette,
  Pose,
  RenderSpec,
  StickerSpec,
  Variant,
} from './core/model';
export { frame } from './core/frame';
export { hasKind, resolveKind } from './kinds/registry';
export type { KindDrawOptions, KindFn, KindRegistration } from './kinds/registry';

// CritterDex data (150 critters incl. 6 guide cp-id aliases, 61 places), generated from
// `design/critters-data.js` by `scripts/import-design-data.ts` — see `src/data/types.ts`.
export { critters } from './data/critters';
export { places } from './data/places';
export { isGuideSpec } from './data/types';
export type { ArchetypeName, ColorTriplet, Critter, CritterSpec, GuideSpec, Place, SetGroup } from './data/types';

// Form/tier model: zod schemas for the `critters.art_params` / `critter_forms.palette,pose,edge`
// jsonb columns (docs/data-model.md), tier colours + edge ring styles (phase 5 asserts equality
// against `@cp/design-tokens`), the designed-form fixtures (Tokek rare/epic/legendary, Sakura Pon
// legendary), and CritterDex-entry -> `RenderSpec` resolution.
export {
  archetypeNameSchema,
  artParamsSchema,
  colorTripletSchema,
  edgeStyleSchema,
  formSpecSchema,
  paletteSchema,
  poseSchema,
} from './forms/schema';
export type { ArtParams } from './forms/schema';
export { EDGE_RING_STYLES, TIER_COLORS } from './forms/tier-palette';
export type { EdgeRingStyle, Rarity, TierColors } from './forms/tier-palette';
export { DESIGNED_FORMS } from './forms/designed';
export type { DesignedForm } from './forms/designed';
export { canonicalSeed, findDesignedForm, resolveRenderSpec } from './forms/resolve';
