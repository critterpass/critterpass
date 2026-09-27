import type { ThemeSpec } from '../render-theme';
import type { SectionSpec } from '../sequencer';

/**
 * Ajo (Mexico City) — PROPOSAL pending founder approval: "marimba lo-fi", a bright syncopated marimba
 * arpeggio over a soft plucked bass, mixolydian, upbeat but relaxed.
 */
const sectionA: SectionSpec = {
  name: 'A',
  bars: 10,
  parts: [
    {
      instrument: 'marimba',
      pattern: {
        steps: [
          { degree: 0 },
          { degree: 2 },
          { degree: null },
          { degree: 4 },
          { degree: 3 },
          { degree: null },
          { degree: 2 },
          { degree: 0 },
        ],
      },
      gain: 0.55,
      send: 0.2,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 0, velocity: 0.85 },
          { degree: null },
          { degree: null },
          { degree: null },
          { degree: 4 },
          { degree: null },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.32,
      octaveOffset: -1,
      send: 0.1,
    },
  ],
};

const sectionB: SectionSpec = {
  name: 'B',
  bars: 10,
  parts: [
    {
      instrument: 'marimba',
      pattern: {
        steps: [
          { degree: 4 },
          { degree: 6 },
          { degree: null },
          { degree: 5 },
          { degree: 4 },
          { degree: null },
          { degree: 3 },
          { degree: 2 },
        ],
      },
      gain: 0.55,
      send: 0.2,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 4, velocity: 0.85 },
          { degree: null },
          { degree: null },
          { degree: null },
          { degree: 1 },
          { degree: null },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.32,
      octaveOffset: -1,
      send: 0.1,
    },
  ],
};

export const ajoTheme: ThemeSpec = {
  guideId: 'ajo',
  title: 'Ajo — marimba lo-fi (proposal)',
  styleDescription:
    'Mexico City: bright syncopated marimba arpeggios over a soft plucked bass, mixolydian, upbeat and relaxed.',
  proposalPendingApproval: true,
  bpm: 92,
  swing: 0.1,
  scale: 'mixolydian',
  rootHz: 261.6,
  stepsPerBar: 8,
  sections: [sectionA, sectionB, sectionA],
  reverbMix: 0.2,
  seed: 'music:ajo:v1',
};
