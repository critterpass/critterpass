/**
 * Deterministic pseudo-random source for the whole synthesis core. Every cue and theme derives its
 * randomness (noise seeds, humanised timing/velocity) from a string seed, so the same seed always
 * produces bit-identical PCM — the property the bake `--check` mode relies on.
 */
export type Rng = () => number;

/** FNV-1a string hash, folded into a 32-bit unsigned seed. */
export function seedFromString(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, good-enough statistical quality for procedural audio, fully deterministic. */
export function createRng(seed: number | string): Rng {
  let state = typeof seed === 'string' ? seedFromString(seed) : seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform float in `[min, max)` from the given rng. */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** A uniform integer in `[min, max]` (inclusive) from the given rng. */
export function rngInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rngRange(rng, min, max + 1));
}

/** Derives a child seed string so sub-components (e.g. one voice within a theme) stay independent. */
export function childSeed(parentSeed: string, tag: string): string {
  return `${parentSeed}::${tag}`;
}
