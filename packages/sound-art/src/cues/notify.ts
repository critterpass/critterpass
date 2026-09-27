import { renderNote, type InstrumentId } from '../music/instruments';
import { degreeToFreq, type ScaleName } from '../music/scale';
import type { GuideId } from '../music/registry';
import { softLimiter } from '../core/effects';
import { childSeed, createRng } from '../core/prng';
import { applyFade, createBuffer, mixInto, removeDcOffset } from '../core/signal';

interface MotifSpec {
  readonly instrument: InstrumentId;
  readonly scale: ScaleName;
  readonly rootHz: number;
  /** Scale degrees played in order, one per note. */
  readonly degrees: readonly number[];
  readonly noteDurSec: number;
  readonly gapSec: number;
}

/** Notification sound per guide (design-system open question 4 default): a short motif built from
 * that guide's theme instrument/scale, so it reads as "that guide" even out of musical context. */
const MOTIFS: Readonly<Record<GuideId, MotifSpec>> = {
  tokek: {
    instrument: 'gamelanMetallophone',
    scale: 'pelog',
    rootHz: 220,
    degrees: [0, 2, 3],
    noteDurSec: 0.42,
    gapSec: 0.1,
  },
  pon: {
    instrument: 'koto',
    scale: 'inScale',
    rootHz: 294,
    degrees: [0, 2, 0],
    noteDurSec: 0.4,
    gapSec: 0.1,
  },
  lundi: {
    instrument: 'guitarPluck',
    scale: 'aeolian',
    rootHz: 196,
    degrees: [0, 4, 2],
    noteDurSec: 0.45,
    gapSec: 0.12,
  },
  ajo: {
    instrument: 'marimba',
    scale: 'mixolydian',
    rootHz: 261.6,
    degrees: [0, 2, 4],
    noteDurSec: 0.28,
    gapSec: 0.06,
  },
  sardi: {
    instrument: 'guitarPluck',
    scale: 'aeolian',
    rootHz: 246.9,
    degrees: [0, 3, 4],
    noteDurSec: 0.35,
    gapSec: 0.08,
  },
  paco: {
    instrument: 'panFlute',
    scale: 'minorPentatonic',
    rootHz: 293.7,
    degrees: [0, 2, 3],
    noteDurSec: 0.4,
    gapSec: 0.1,
  },
};

/** Renders the ≤2s notification motif for a guide. */
export function renderNotify(guideId: GuideId): Float32Array {
  const spec = MOTIFS[guideId];
  const total = spec.degrees.length * (spec.noteDurSec + spec.gapSec) + 0.15;
  const out = createBuffer(total);
  spec.degrees.forEach((degree, i) => {
    const freqHz = degreeToFreq(spec.rootHz, spec.scale, degree);
    const rng = createRng(childSeed(`notify:${guideId}:v1`, String(i)));
    const note = renderNote(spec.instrument, {
      freqHz,
      durationSec: spec.noteDurSec * 1.6,
      rng,
      velocity: 0.85,
    });
    mixInto(out, note, 0.85, Math.round(i * (spec.noteDurSec + spec.gapSec) * 48000));
  });
  applyFade(out, 0, Math.round(0.08 * 48000));
  softLimiter(out, 0.9);
  removeDcOffset(out);
  return out;
}

export { MOTIFS as NOTIFY_MOTIFS };
