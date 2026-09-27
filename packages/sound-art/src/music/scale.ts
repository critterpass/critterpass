/**
 * Scale degrees as cents above the root, one octave. Pelog, slendro and the Japanese "in" scale are
 * not equal-tempered in the real instruments — these are documented Western 12-TET approximations
 * (ADR `docs/decisions/`), chosen for a lo-fi mobile app rather than ethnomusicological accuracy.
 */
export type ScaleName =
  | 'pelog'
  | 'slendro'
  | 'inScale'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'aeolian'
  | 'mixolydian'
  | 'dorian';

const CENTS_PER_OCTAVE = 1200;

export const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  // 5-note approximation of a common pelog subset (bem/barang-ish): unequal steps, no tritone feel.
  pelog: [0, 120, 265, 700, 785],
  // 5-note near-equidistant slendro approximation.
  slendro: [0, 240, 480, 720, 960],
  // Japanese "in" scale ascending form: minor 2nd, perfect 4th, minor 6th steps.
  inScale: [0, 100, 500, 700, 800],
  majorPentatonic: [0, 200, 400, 700, 900],
  minorPentatonic: [0, 300, 500, 700, 1000],
  aeolian: [0, 200, 300, 500, 700, 800, 1000],
  mixolydian: [0, 200, 400, 500, 700, 900, 1000],
  dorian: [0, 200, 300, 500, 700, 900, 1000],
};

/**
 * Converts a scale degree (may be negative or exceed the scale length — wraps across octaves) to a
 * frequency in Hz relative to `rootHz`.
 */
export function degreeToFreq(rootHz: number, scale: ScaleName, degree: number): number {
  const steps = SCALES[scale];
  const len = steps.length;
  const octave = Math.floor(degree / len);
  const indexInOctave = ((degree % len) + len) % len;
  const cents = (steps[indexInOctave] ?? 0) + octave * CENTS_PER_OCTAVE;
  return rootHz * Math.pow(2, cents / CENTS_PER_OCTAVE);
}
