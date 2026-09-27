import type { ThemeSpec } from '../render-theme';
import type { SectionSpec } from '../sequencer';

/**
 * Paco (Cusco) — PROPOSAL pending founder approval: "Andean pan flute + charango", a breathy pan-flute
 * melody over a fast, bright charango strum-like arpeggio, minor pentatonic, lively.
 */
const sectionA: SectionSpec = {
  name: 'A',
  bars: 10,
  parts: [
    {
      instrument: 'panFlute',
      pattern: {
        steps: [
          { degree: 0, lengthSteps: 2 },
          { degree: null },
          { degree: 2 },
          { degree: 3, lengthSteps: 2 },
          { degree: null },
          { degree: 2 },
          { degree: 0, lengthSteps: 2 },
          { degree: null },
        ],
      },
      gain: 0.55,
      send: 0.25,
    },
    {
      instrument: 'charango',
      pattern: {
        steps: Array.from({ length: 8 }, (_, i) => ({
          degree: [0, 2, 3, 2, 0, 3, 2, 4][i] ?? 0,
          velocity: 0.5,
        })),
      },
      gain: 0.32,
      octaveOffset: 1,
      send: 0.1,
    },
  ],
};

const sectionB: SectionSpec = {
  name: 'B',
  bars: 10,
  parts: [
    {
      instrument: 'panFlute',
      pattern: {
        steps: [
          { degree: 4, lengthSteps: 2 },
          { degree: null },
          { degree: 3 },
          { degree: 2, lengthSteps: 2 },
          { degree: null },
          { degree: 0 },
          { degree: 4, lengthSteps: 2 },
          { degree: null },
        ],
      },
      gain: 0.55,
      send: 0.25,
    },
    {
      instrument: 'charango',
      pattern: {
        steps: Array.from({ length: 8 }, (_, i) => ({
          degree: [4, 3, 2, 3, 4, 2, 0, 2][i] ?? 0,
          velocity: 0.5,
        })),
      },
      gain: 0.32,
      octaveOffset: 1,
      send: 0.1,
    },
  ],
};

export const pacoTheme: ThemeSpec = {
  guideId: 'paco',
  title: 'Paco — Andean pan flute + charango (proposal)',
  styleDescription:
    'Cusco: a breathy pan-flute melody over a fast, bright charango arpeggio, minor pentatonic and lively.',
  proposalPendingApproval: true,
  bpm: 96,
  swing: 0.05,
  scale: 'minorPentatonic',
  rootHz: 293.7,
  stepsPerBar: 8,
  sections: [sectionA, sectionB, sectionA],
  reverbMix: 0.22,
  seed: 'music:paco:v1',
};
