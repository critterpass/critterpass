// Public surface lands once `build`/`frame`/`layout` exist (op/model task) and once the kind
// registry exists (guides/icons task); math primitives (`src/core/{rng,spline,shapes,ribbon}`) stay
// package-internal implementation detail until then.
export {};
