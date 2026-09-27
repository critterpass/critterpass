import type { ThemeSpec } from '../render-theme';
import type { SectionSpec } from '../sequencer';

/**
 * Sardi (Lisbon) — PROPOSAL pending founder approval: "fado-style plucked guitar waltz", a minor,
 * gently swaying plucked-guitar melody with a one-two-three lilt (accented via velocity, since the
 * sequencer's grid is 4-beat-bar based rather than true 3/4 — see the in-house-audio ADR).
 */
const sectionA: SectionSpec = {
  name: 'A',
  bars: 8,
  parts: [
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 0, velocity: 0.95 },
          { degree: 2, velocity: 0.55 },
          { degree: 3, velocity: 0.5 },
          { degree: 4, velocity: 0.95 },
          { degree: 3, velocity: 0.55 },
          { degree: 2, velocity: 0.5 },
        ],
      },
      gain: 0.6,
      send: 0.3,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 0, velocity: 0.8 },
          { degree: null },
          { degree: null },
          { degree: 4, velocity: 0.7 },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.3,
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
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 3, velocity: 0.95 },
          { degree: 4, velocity: 0.55 },
          { degree: 6, velocity: 0.5 },
          { degree: 7, velocity: 0.9 }, // one scale octave above the root (degreeToFreq wraps per-scale)
          { degree: 5, velocity: 0.55 },
          { degree: 3, velocity: 0.5 },
        ],
      },
      gain: 0.6,
      send: 0.3,
    },
    {
      instrument: 'guitarPluck',
      pattern: {
        steps: [
          { degree: 3, velocity: 0.8 },
          { degree: null },
          { degree: null },
          { degree: 0, velocity: 0.7 },
          { degree: null },
          { degree: null },
        ],
      },
      gain: 0.3,
      octaveOffset: -1,
      send: 0.15,
    },
  ],
};

export const sardiTheme: ThemeSpec = {
  guideId: 'sardi',
  title: 'Sardi — fado-style plucked guitar waltz (proposal)',
  styleDescription:
    'Lisbon: a minor plucked-guitar waltz with a gentle one-two-three lilt, fado-adjacent phrasing.',
  proposalPendingApproval: true,
  bpm: 84,
  swing: 0,
  scale: 'aeolian',
  rootHz: 246.9,
  stepsPerBar: 6,
  sections: [sectionA, sectionB, sectionA],
  reverbMix: 0.55,
  seed: 'music:sardi:v1',
};
