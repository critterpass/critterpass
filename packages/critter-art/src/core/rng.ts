export type Rng = () => number;

/**
 * Seeded pseudo-random generator (mulberry32 variant), ported bit-for-bit from
 * design/doodles.js `rng(seed)`. Every wash/stroke/line op threads its own `seed + n` through
 * this so wobble and watercolour misregistration stay reproducible per critter and per frame.
 */
export function createRng(seed: number): Rng {
  let a = (seed * 1000003) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
