import { biquadCoeffs, applyBiquad } from '../../core/filter';
import { pinkNoise } from '../../core/noise';
import { createRng } from '../../core/prng';
import type { ThemeSpec } from '../render-theme';
import type { SectionSpec, Step } from '../sequencer';

/** A stationary filtered pink-noise "rain on the eaves" ambient bed. */
function rainBed(durationSec: number, seed: string): Float32Array {
  const noise = pinkNoise(durationSec, createRng(seed));
  return applyBiquad(noise, biquadCoeffs('highpass', 1400, 0.7));
}

const sectionA: SectionSpec = {
  name: 'A',
  bars: 6,
  parts: [
    {
      instrument: 'koto',
      pattern: {
        steps: [
          { degree: 0, lengthSteps: 2 },
          { degree: null },
          { degree: 2, lengthSteps: 2 },
          { degree: null },
          { degree: 3 },
          { degree: 2 },
          { degree: 0, lengthSteps: 2 },
          { degree: null },
        ],
      },
      gain: 0.55,
      send: 0.35,
    },
    {
      instrument: 'koto',
      pattern: {
        steps: [
          { degree: -3, lengthSteps: 8, velocity: 0.6 },
          ...Array.from({ length: 7 }, (): Step => ({ degree: null })),
        ],
      },
      gain: 0.3,
      octaveOffset: -1,
      send: 0.4,
    },
  ],
};

const sectionB: SectionSpec = {
  name: 'B',
  bars: 6,
  parts: [
    {
      instrument: 'koto',
      pattern: {
        steps: [
          { degree: 4, lengthSteps: 2 },
          { degree: null },
          { degree: 3 },
          { degree: 2 },
          { degree: 0, lengthSteps: 2 },
          { degree: null },
          { degree: 2, lengthSteps: 2 },
          { degree: null },
        ],
      },
      gain: 0.55,
      send: 0.35,
    },
    {
      instrument: 'koto',
      pattern: {
        steps: [
          { degree: -1, lengthSteps: 8, velocity: 0.55 },
          ...Array.from({ length: 7 }, (): Step => ({ degree: null })),
        ],
      },
      gain: 0.28,
      octaveOffset: -1,
      send: 0.4,
    },
  ],
};

export const ponTheme: ThemeSpec = {
  guideId: 'pon',
  title: 'Pon — koto and rain',
  styleDescription:
    'Kyoto koto and rain: a spare, legato koto melody in an "in scale" approximation over filtered-noise rain.',
  bpm: 66,
  swing: 0.05,
  scale: 'inScale',
  rootHz: 294,
  stepsPerBar: 8,
  sections: [sectionA, sectionB, sectionA],
  ambientBed: rainBed,
  ambientBedGain: 0.32,
  reverbMix: 0.6,
  seed: 'music:pon:v1',
};
