import { schroederReverb } from '../core/effects';
import { normalizeToLufs, integratedLufs } from '../loudness/lufs';
import { normalizeToTruePeak, truePeakDb } from '../loudness/peak';
import { makeLoopSeamless, measureLoopSeam, type LoopSeamReport } from '../core/mixer';
import { childSeed, createRng } from '../core/prng';
import { applyFade, createBuffer, mixInto, removeDcOffset, SAMPLE_RATE } from '../core/signal';
import { degreeToFreq, type ScaleName } from './scale';
import { renderNote } from './instruments';
import { sectionDurationSec, sectionToEvents, type SectionSpec } from './sequencer';

export interface ThemeSpec {
  readonly guideId: string;
  readonly title: string;
  readonly styleDescription: string;
  /** Set for the 3 themes still awaiting founder sign-off (design-system open question 3). */
  readonly proposalPendingApproval?: boolean;
  readonly bpm: number;
  readonly swing: number;
  readonly scale: ScaleName;
  readonly rootHz: number;
  readonly stepsPerBar: number;
  /** Ordered sections, e.g. [A, B, A] — the whole sequence is one seamless loop. */
  readonly sections: readonly SectionSpec[];
  /** An optional stationary background bed (e.g. rain) mixed under the whole loop. */
  readonly ambientBed?: (durationSec: number, seed: string) => Float32Array;
  readonly ambientBedGain?: number;
  readonly reverbMix?: number;
  readonly seed: string;
}

export interface RenderedTheme {
  readonly pcm: Float32Array;
  readonly previewPcm: Float32Array;
  readonly sampleRate: number;
  readonly durationSec: number;
  readonly loudnessLufs: number;
  readonly loopSeam: LoopSeamReport;
}

const LOOP_CROSSFADE_SAMPLES = Math.round(SAMPLE_RATE * 0.02);
const PREVIEW_DURATION_SEC = 10;
const TARGET_MUSIC_LUFS = -16;
// A sparse/ambient arrangement's gated integrated loudness can sit well below its transient peaks,
// so hitting -16 LUFS exactly could demand a gain that clips. Peak safety always wins: once the loop
// is loudness-normalised, a true-peak ceiling is applied on top, even if that leaves LUFS a bit low.
const MUSIC_TRUE_PEAK_CEILING_DB = -1;

/** Accumulates `buf` into `out` at integer index `startSample`, wrapping modulo `out.length` — the
 * correct way to fold an effect tail (reverb) that runs past the loop's end back into its start. */
function wrapAdd(out: Float32Array, buf: Float32Array, startSample: number): void {
  for (let i = 0; i < buf.length; i += 1) {
    const idx = (((startSample + i) % out.length) + out.length) % out.length;
    out[idx] = (out[idx] ?? 0) + (buf[i] ?? 0);
  }
}

/** Composes and renders a full guide theme loop from its section/pattern spec. */
export function renderTheme(spec: ThemeSpec): RenderedTheme {
  const totalDurationSec = spec.sections.reduce(
    (sum, s) => sum + sectionDurationSec(s, spec.bpm),
    0,
  );
  const loopLength = Math.round(totalDurationSec * SAMPLE_RATE);

  const dry = new Float32Array(loopLength);
  const sendBus = new Float32Array(loopLength + Math.round(SAMPLE_RATE * 1.2)); // room for reverb tail

  let cursorSec = 0;
  for (const section of spec.sections) {
    const events = sectionToEvents(section, cursorSec, spec.bpm, spec.stepsPerBar, spec.swing, {
      seed: childSeed(spec.seed, spec.guideId),
    });
    for (const [idx, event] of events.entries()) {
      const freqHz =
        degreeToFreq(spec.rootHz, spec.scale, event.degree) * Math.pow(2, event.octaveOffset);
      const noteRng = createRng(
        childSeed(spec.seed, `${section.name}:${idx}:${event.startSec.toFixed(5)}`),
      );
      const noteBuf = renderNote(event.instrument, {
        freqHz,
        durationSec: Math.max(0.08, event.durationSec * 1.4), // let the natural decay ring past the step
        rng: noteRng,
        velocity: event.velocity,
      });
      const startSample = Math.round(event.startSec * SAMPLE_RATE);
      mixInto(dry, noteBuf, event.gain, startSample);
      if (event.send > 0) mixInto(sendBus, noteBuf, event.send, startSample);
    }
    cursorSec += sectionDurationSec(section, spec.bpm);
  }

  const wet = schroederReverb(sendBus, { mix: 1, sampleRate: SAMPLE_RATE });
  const wetWrapped = new Float32Array(loopLength);
  wrapAdd(wetWrapped, wet, 0);

  const mixed = createBuffer(totalDurationSec);
  mixInto(mixed, dry, 1);
  mixInto(mixed, wetWrapped, spec.reverbMix ?? 0.22);

  if (spec.ambientBed) {
    const bed = spec.ambientBed(totalDurationSec, childSeed(spec.seed, 'ambient-bed'));
    makeLoopSeamless(bed, LOOP_CROSSFADE_SAMPLES);
    mixInto(mixed, bed, spec.ambientBedGain ?? 0.12);
  }

  removeDcOffset(mixed);
  makeLoopSeamless(mixed, LOOP_CROSSFADE_SAMPLES);
  normalizeToLufs(mixed, TARGET_MUSIC_LUFS, SAMPLE_RATE);
  if (truePeakDb(mixed) > MUSIC_TRUE_PEAK_CEILING_DB) {
    normalizeToTruePeak(mixed, MUSIC_TRUE_PEAK_CEILING_DB);
  }

  const previewSamples = Math.min(mixed.length, Math.round(PREVIEW_DURATION_SEC * SAMPLE_RATE));
  const preview = mixed.slice(0, previewSamples);
  applyFade(preview, Math.round(SAMPLE_RATE * 0.05), Math.round(SAMPLE_RATE * 0.4));

  return {
    pcm: mixed,
    previewPcm: preview,
    sampleRate: SAMPLE_RATE,
    durationSec: totalDurationSec,
    loudnessLufs: integratedLufs(mixed, SAMPLE_RATE),
    loopSeam: measureLoopSeam(mixed),
  };
}
