import { applyBiquad, biquadCoeffs } from '../../core/filter';
import { brownNoise } from '../../core/noise';
import { createRng } from '../../core/prng';
import type { ThemeSpec } from '../render-theme';
import type { PartSpec, SectionSpec, Step } from '../sequencer';

/**
 * Chà Vá (Đà Nẵng, a red-shanked douc langur on the Sơn Trà peninsula) — PROPOSAL pending founder
 * approval: "đàn bầu lo-fi". A bending, singing monochord melody in the Vietnamese "điệu Bắc"
 * pentatonic over rolling đàn tranh plucks, a soft low pluck bass, a light wooden mõ knock and a
 * faint distant surf. The melody is written bar by bar, so each bar is its own one-bar section.
 */

const STEPS_PER_BAR = 8;

type Note = readonly [degree: number | null, lengthSteps: number, velocity?: number];

/** Expands `[degree, lengthSteps]` notes into one bar's step grid (a held note rests the steps it covers). */
function bar(...notes: readonly Note[]): Step[] {
  const steps: Step[] = [];
  for (const [degree, lengthSteps, velocity] of notes) {
    steps.push(
      degree === null
        ? { degree: null }
        : velocity === undefined
          ? { degree, lengthSteps }
          : { degree, lengthSteps, velocity },
    );
    for (let i = 1; i < lengthSteps; i += 1) steps.push({ degree: null });
  }
  if (steps.length !== STEPS_PER_BAR) throw new Error(`chava bar has ${steps.length} steps`);
  return steps;
}

const MELODY_A: readonly Step[][] = [
  bar([2, 3], [3, 1], [4, 4]),
  bar([3, 2], [2, 2], [1, 4]),
  bar([0, 3], [1, 1], [2, 2], [4, 2]),
  bar([3, 8, 0.8]),
  bar([2, 3], [3, 1], [4, 2], [5, 2]),
  bar([4, 2], [3, 2], [2, 4]),
  bar([1, 3], [2, 1], [1, 2], [-1, 2]),
  bar([0, 8, 0.8]),
];

const MELODY_B: readonly Step[][] = [
  bar([5, 2], [null, 1], [6, 1], [5, 4]),
  bar([4, 3], [3, 1], [4, 4]),
  bar([5, 2], [7, 2], [6, 4]),
  bar([5, 8, 0.8]),
  bar([4, 2], [5, 2], [4, 2], [3, 2]),
  bar([2, 4], [null, 2], [3, 2]),
  bar([4, 3], [3, 1], [2, 2], [1, 2]),
  bar([1, 8, 0.75]),
];

// The bass root under each bar; the đàn tranh rolls around the same root.
const ROOTS_A = [2, 1, 0, 3, 2, 4, 1, 0] as const;
const ROOTS_B = [0, 2, 2, 0, 4, 2, 1, 1] as const;

function tranhRoll(root: number): Step[] {
  return [
    { degree: root, velocity: 0.7 },
    { degree: null },
    { degree: root + 2, velocity: 0.55 },
    { degree: root + 3, velocity: 0.6 },
    { degree: null },
    { degree: root + 5, velocity: 0.55 },
    { degree: root + 3, velocity: 0.5 },
    { degree: null },
  ];
}

function bassLine(root: number): Step[] {
  return bar([root, 4, 0.85], [root + 3, 4, 0.6]);
}

const MO_KNOCK: readonly Step[] = [
  { degree: null },
  { degree: null },
  { degree: 0, velocity: 0.55 },
  { degree: null },
  { degree: null },
  { degree: null },
  { degree: 2, velocity: 0.6 },
  { degree: 0, velocity: 0.35 },
];

function barSection(name: string, melody: readonly Step[], root: number): SectionSpec {
  const parts: PartSpec[] = [
    { instrument: 'danBau', pattern: { steps: melody }, gain: 0.6, octaveOffset: 1, send: 0.4 },
    { instrument: 'danTranh', pattern: { steps: tranhRoll(root) }, gain: 0.3, send: 0.3 },
    {
      instrument: 'guitarPluck',
      pattern: { steps: bassLine(root) },
      gain: 0.3,
      octaveOffset: -1,
      send: 0.1,
    },
    {
      instrument: 'woodBlock',
      pattern: { steps: MO_KNOCK },
      gain: 0.16,
      octaveOffset: 2,
      send: 0.1,
    },
  ];
  return { name, bars: 1, parts };
}

function phrase(label: string, melody: readonly Step[][], roots: readonly number[]): SectionSpec[] {
  return melody.map((steps, i) => barSection(`${label}${i + 1}`, steps, roots[i] ?? 0));
}

/** A faint low "distant surf" bed: brown noise under a low-pass, swelling in whole waves per loop. */
function surfBed(durationSec: number, seed: string): Float32Array {
  const noise = applyBiquad(
    brownNoise(durationSec, createRng(seed)),
    biquadCoeffs('lowpass', 520, 0.7),
  );
  const waves = 10; // a whole number of swells, so the bed is identical at both ends of the loop
  for (let i = 0; i < noise.length; i += 1) {
    const phase = (i / noise.length) * waves;
    const swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * phase - Math.PI / 2);
    noise[i] = (noise[i] ?? 0) * swell;
  }
  return noise;
}

export const chavaTheme: ThemeSpec = {
  guideId: 'chava',
  title: 'Chà Vá — đàn bầu lo-fi (proposal)',
  styleDescription:
    'Đà Nẵng, Sơn Trà: a bending đàn bầu-like monochord melody in the Vietnamese điệu Bắc pentatonic over rolling đàn tranh plucks, a soft pluck bass, a light wooden mõ knock and faint distant surf; warm, curious and unhurried.',
  proposalPendingApproval: true,
  bpm: 72,
  swing: 0.12,
  scale: 'vietBac',
  rootHz: 196,
  stepsPerBar: STEPS_PER_BAR,
  sections: [
    ...phrase('A', MELODY_A, ROOTS_A),
    ...phrase('B', MELODY_B, ROOTS_B),
    ...phrase('C', MELODY_A, ROOTS_A),
  ],
  ambientBed: surfBed,
  ambientBedGain: 0.1,
  reverbMix: 0.3,
  seed: 'music:chava:v1',
};
