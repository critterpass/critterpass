import type { ThemeSpec } from '../render-theme';
import type { SectionSpec } from '../sequencer';

/**
 * Lundi (Iceland) — "slow sea shanty": a reed (concertina-like) lead over a plucked low bass marking
 * the downbeat, in a slow lilting minor sextuplet grid (a 6/8-flavoured approximation). Named theme.
 */
const sectionA: SectionSpec = {
  name: 'A',
  bars: 6,
  parts: [
    {
      instrument: 'reed',
      pattern: {
        steps: [
          { degree: 0, lengthSteps: 3, velocity: 0.8 },
          { degree: null },
          { degree: null },
          { degree: 2, lengthSteps: 2 },
          { degree: null },
          { degree: 1 },
        ],
      },
      gain: 0.6,
      send: 0.25,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 0, velocity: 0.9 },
          { degree: null },
          { degree: null },
          { degree: 4 },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.35,
      octaveOffset: -1,
      send: 0.15,
    },
  ],
};

const sectionB: SectionSpec = {
  name: 'B',
  bars: 8,
  parts: [
    {
      instrument: 'reed',
      pattern: {
        steps: [
          { degree: 3, lengthSteps: 3, velocity: 0.85 },
          { degree: null },
          { degree: null },
          { degree: 4, lengthSteps: 2 },
          { degree: null },
          { degree: 2 },
        ],
      },
      gain: 0.62,
      send: 0.25,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 3, velocity: 0.9 },
          { degree: null },
          { degree: null },
          { degree: 0 },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.35,
      octaveOffset: -1,
      send: 0.15,
    },
  ],
};

export const lundiTheme: ThemeSpec = {
  guideId: 'lundi',
  title: 'Lundi — slow sea shanty',
  styleDescription:
    'Iceland slow sea shanty: a reed lead over a plucked low bass, gently swaying in a minor key.',
  bpm: 58,
  swing: 0,
  scale: 'aeolian',
  rootHz: 196,
  stepsPerBar: 6,
  sections: [sectionA, sectionB, sectionA],
  reverbMix: 0.24,
  seed: 'music:lundi:v1',
};
