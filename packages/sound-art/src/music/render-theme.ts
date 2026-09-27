import { schroederReverb } from '../core/effects';
import { integratedLufs } from '../loudness/lufs';
import { matchLoudnessWithLimiter } from '../loudness/match';
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
const MUSIC_LUFS_TOLERANCE = 1; // every theme lands within +/-1 LU of the target
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
  matchLoudnessWithLimiter(mixed, {
    targetLufs: TARGET_MUSIC_LUFS,
    toleranceLu: MUSIC_LUFS_TOLERANCE,
    ceilingDb: MUSIC_TRUE_PEAK_CEILING_DB,
    // Musical, transparent limiting: koto/guitar-pluck attacks are near-instant, so a short look-ahead
    // catches them; a gentle release keeps the recovery inaudible rather than pumping.
    lookaheadSec: 0.005,
    releaseSec: 0.15,
    sampleRate: SAMPLE_RATE,
    label: `theme "${spec.guideId}"`,
    // Narrows the gap between a sparse, plucked arrangement's peaks and its sustained level, so the
    // limiter above doesn't have to claw back as much loudness from a wide crest factor.
    crestReduction: { thresholdOffsetDb: -4, ratio: 2.5, attackSec: 0.006, releaseSec: 0.2 },
  });
  // Seal the loop wrap point once, after loudness matching (the limiter's per-sample gain can differ
  // slightly between the two ends). The equal-power crossfade this performs can — for two correlated,
  // near-simultaneous peaks — sum to a hair over either input's own peak, so re-check the true-peak
  // ceiling unconditionally afterwards rather than assuming the crossfade alone preserves it.
  makeLoopSeamless(mixed, LOOP_CROSSFADE_SAMPLES);
  // The compressor/limiter chain above can reintroduce a small DC bias (asymmetric gain over time on
  // an otherwise-balanced waveform). A uniform per-sample subtraction can't disturb the wrap-point
  // equality `makeLoopSeamless` just guaranteed, but it can nudge an already-at-ceiling sample a hair
  // further out, so the true-peak check runs again afterwards rather than only before.
  removeDcOffset(mixed);
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
