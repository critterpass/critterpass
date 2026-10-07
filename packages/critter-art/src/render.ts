// The drawing pipeline on its own, for code that ships to the open web: nothing here reaches the
// catalogue (`./data/critters`), so a bundle built from this entry carries no critter's name,
// species or city. Kinds register from `./data/drawings`, which holds art parameters only.
export type { ArtBox, Layout } from './core/layout';
export { layout } from './core/layout';
export { build, DEFAULT_INK } from './core/model';
export type { Model, Pose, RenderSpec, Variant } from './core/model';
export { frame } from './core/frame';
