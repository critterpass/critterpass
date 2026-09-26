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
