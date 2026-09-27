import type { InstrumentId } from './instruments';
import type { ScaleName } from './scale';
import { childSeed, createRng, rngRange } from '../core/prng';

/** One grid step: `degree` is a scale degree (see `scale.ts`), or `null` for a rest. */
export interface Step {
  readonly degree: number | null;
  readonly velocity?: number;
  /** How many grid steps this note sustains for (default 1). */
  readonly lengthSteps?: number;
}

export interface Pattern {
  readonly steps: readonly Step[];
}

export interface PartSpec {
  readonly instrument: InstrumentId;
  readonly pattern: Pattern;
  readonly octaveOffset?: number;
  readonly gain?: number;
  /** Reverb/delay send amount 0-1 for this part (0 = dry). */
  readonly send?: number;
}

export interface SectionSpec {
  readonly name: string;
  readonly parts: readonly PartSpec[];
  readonly bars: number;
}

export interface NoteEvent {
  readonly startSec: number;
  readonly durationSec: number;
  readonly degree: number;
  readonly velocity: number;
  readonly instrument: InstrumentId;
  readonly octaveOffset: number;
  readonly gain: number;
  readonly send: number;
}

export interface HumanizeOptions {
  readonly timingJitterSec?: number;
  readonly velocityJitter?: number;
  readonly seed: string;
}

/**
 * Expands a section's step patterns into absolute-time note events, given a starting time, tempo
 * and steps-per-bar grid (patterns repeat across `section.bars`). Applies seeded humanisation
 * (small timing/velocity jitter) so the mechanical grid doesn't feel quantised-stiff.
 */
export function sectionToEvents(
  section: SectionSpec,
  startSec: number,
  bpm: number,
  stepsPerBar: number,
  swing: number,
  humanize: HumanizeOptions,
): NoteEvent[] {
  const secPerBeat = 60 / bpm;
  const beatsPerBar = 4;
  const secPerStep = (secPerBeat * beatsPerBar) / stepsPerBar;
  const events: NoteEvent[] = [];

  section.parts.forEach((part, partIdx) => {
    const rng = createRng(childSeed(humanize.seed, `${section.name}:${partIdx}`));
    const timingJitter = humanize.timingJitterSec ?? 0.012;
    const velocityJitter = humanize.velocityJitter ?? 0.12;
    const stepsInPattern = part.pattern.steps.length;

    for (let bar = 0; bar < section.bars; bar += 1) {
      for (let stepIdx = 0; stepIdx < stepsInPattern; stepIdx += 1) {
        const step = part.pattern.steps[stepIdx];
        if (!step || step.degree === null) continue;
        const globalStep = bar * stepsInPattern + stepIdx;
        const isOffBeat = stepIdx % 2 === 1;
        const swingOffset = isOffBeat ? swing * secPerStep * 0.5 : 0;
        const jitter = rngRange(rng, -timingJitter, timingJitter);
        const baseTime = startSec + globalStep * secPerStep + swingOffset + jitter;
        const velocity = Math.min(
          1,
          Math.max(0.05, (step.velocity ?? 0.85) + rngRange(rng, -velocityJitter, velocityJitter)),
        );
        events.push({
          startSec: Math.max(startSec, baseTime),
          durationSec: (step.lengthSteps ?? 1) * secPerStep,
          degree: step.degree,
          velocity,
          instrument: part.instrument,
          octaveOffset: part.octaveOffset ?? 0,
          gain: part.gain ?? 1,
          send: part.send ?? 0,
        });
      }
    }
  });

  return events;
}

/** Total duration in seconds of a section at the given tempo (4 beats/bar, as `sectionToEvents` assumes). */
export function sectionDurationSec(section: SectionSpec, bpm: number): number {
  const secPerBar = (60 / bpm) * 4;
  return section.bars * secPerBar;
}

export type { ScaleName };
