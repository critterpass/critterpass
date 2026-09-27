import type { ThemeSpec } from '../render-theme';
import type { SectionSpec, Step } from '../sequencer';

/**
 * Tokek (Bali) — "gamelan lo-fi": a two-part interlocking kotekan-style metallophone ostinato over a
 * slow gong-like bass hit, in a pelog approximation. Named theme, not a proposal.
 */
const sectionA: SectionSpec = {
  name: 'A',
  bars: 8,
  parts: [
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: 0 },
          { degree: null },
          { degree: 2 },
          { degree: null },
          { degree: 3 },
          { degree: null },
          { degree: 1 },
          { degree: null },
        ],
      },
      gain: 0.5,
      send: 0.3,
    },
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: null },
          { degree: 3 },
          { degree: null },
          { degree: 1 },
          { degree: null },
          { degree: 4 },
          { degree: null },
          { degree: 2 },
        ],
      },
      gain: 0.4,
      octaveOffset: 1,
      send: 0.3,
    },
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: 0, lengthSteps: 8, velocity: 0.9 },
          ...Array.from({ length: 7 }, (): Step => ({ degree: null })),
        ],
      },
      gain: 0.55,
      octaveOffset: -1,
      send: 0.4,
    },
  ],
};

const sectionB: SectionSpec = {
  name: 'B',
  bars: 8,
  parts: [
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: 2 },
          { degree: null },
          { degree: 4 },
          { degree: null },
          { degree: 0 },
          { degree: null },
          { degree: 3 },
          { degree: null },
        ],
      },
      gain: 0.5,
      send: 0.3,
    },
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: null },
          { degree: 0 },
          { degree: null },
          { degree: 3 },
          { degree: null },
          { degree: 1 },
          { degree: null },
          { degree: 4 },
        ],
      },
      gain: 0.42,
      octaveOffset: 1,
      send: 0.3,
    },
    {
      instrument: 'gamelanMetallophone',
      pattern: {
        steps: [
          { degree: 3, lengthSteps: 8, velocity: 0.85 },
          ...Array.from({ length: 7 }, (): Step => ({ degree: null })),
        ],
      },
      gain: 0.5,
      octaveOffset: -1,
      send: 0.4,
    },
  ],
};

export const tokekTheme: ThemeSpec = {
  guideId: 'tokek',
  title: 'Tokek — gamelan lo-fi',
  styleDescription:
    'Bali gamelan lo-fi: interlocking kotekan metallophone ostinato in a pelog approximation over a slow gong bass.',
  bpm: 74,
  swing: 0.15,
  scale: 'pelog',
  rootHz: 220,
  stepsPerBar: 8,
  sections: [sectionA, sectionB, sectionA],
  reverbMix: 0.28,
  seed: 'music:tokek:v1',
};
