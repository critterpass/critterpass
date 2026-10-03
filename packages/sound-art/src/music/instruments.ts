import { renderAdditive, withAttack, type Partial } from '../core/additive';
import { biquadCoeffs, applyBiquad } from '../core/filter';
import { renderPluck } from '../core/karplus-strong';
import { pinkNoise } from '../core/noise';
import { renderOscillator } from '../core/oscillator';
import type { Rng } from '../core/prng';
import { applyGain, mixInto, createBuffer } from '../core/signal';

export type InstrumentId =
  | 'gamelanMetallophone'
  | 'koto'
  | 'reed'
  | 'marimba'
  | 'guitarPluck'
  | 'panFlute'
  | 'charango'
  | 'danBau'
  | 'danTranh'
  | 'woodBlock';

export interface NoteContext {
  readonly freqHz: number;
  readonly durationSec: number;
  readonly rng: Rng;
  /** 0-1 note velocity from the pattern/humanisation. */
  readonly velocity: number;
}

// Bronze bar / metallophone-style inharmonic partials (gamelan gender/saron family character).
const METALLOPHONE_PARTIALS: readonly Partial[] = [
  { ratio: 1, amplitude: 1, decaySec: 1.4 },
  { ratio: 2.76, amplitude: 0.45, decaySec: 1.0 },
  { ratio: 5.4, amplitude: 0.22, decaySec: 0.6 },
  { ratio: 8.93, amplitude: 0.12, decaySec: 0.35 },
];

// A marimba bar's fundamental plus its characteristic ~4x and ~10x tube-reinforced overtones.
// A small hollow wooden slit drum (mõ): a short knock with one inharmonic overtone.
const WOOD_BLOCK_PARTIALS: readonly Partial[] = [
  { ratio: 1, amplitude: 1, decaySec: 0.045 },
  { ratio: 2.71, amplitude: 0.3, decaySec: 0.02 },
];

const MARIMBA_PARTIALS: readonly Partial[] = [
  { ratio: 1, amplitude: 1, decaySec: 0.5 },
  { ratio: 3.93, amplitude: 0.35, decaySec: 0.22 },
  { ratio: 9.4, amplitude: 0.12, decaySec: 0.12 },
];

function renderMetallophoneLike(ctx: NoteContext, partials: readonly Partial[]): Float32Array {
  const raw = renderAdditive(ctx.durationSec, ctx.freqHz, partials);
  const attacked = withAttack(raw, 0.003);
  applyGain(attacked, ctx.velocity);
  return attacked;
}

function renderPluckLike(ctx: NoteContext, opts: { decay: number; damping: number }): Float32Array {
  const buf = renderPluck(ctx.durationSec, ctx.freqHz, ctx.rng, opts);
  applyGain(buf, ctx.velocity);
  return buf;
}

/** Two slightly detuned sawtooths through a warm lowpass — a reed/concertina-like sustained voice. */
function renderReed(ctx: NoteContext): Float32Array {
  const detuneHz = ctx.freqHz * 0.006;
  const a = renderOscillator(ctx.durationSec, () => ctx.freqHz - detuneHz, 'saw');
  const b = renderOscillator(ctx.durationSec, () => ctx.freqHz + detuneHz, 'saw');
  const mixed = createBuffer(ctx.durationSec);
  mixInto(mixed, a, 0.5);
  mixInto(mixed, b, 0.5);
  const shaped = applyBiquad(mixed, biquadCoeffs('lowpass', Math.min(3200, ctx.freqHz * 6), 0.8));
  const attack = Math.min(0.05, ctx.durationSec * 0.2);
  const release = Math.min(0.12, ctx.durationSec * 0.4);
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    const env =
      t < attack
        ? t / attack
        : t > ctx.durationSec - release
          ? Math.max(0, (ctx.durationSec - t) / release)
          : 1;
    shaped[i] = (shaped[i] ?? 0) * env;
  }
  applyGain(shaped, ctx.velocity * 0.8);
  return shaped;
}

/** A breathy sine lead with a light noise-through-lowpass "breath" layer — a pan-flute-like voice. */
function renderPanFlute(ctx: NoteContext): Float32Array {
  const tone = renderOscillator(ctx.durationSec, () => ctx.freqHz, 'sine');
  const breath = applyBiquad(
    pinkNoise(ctx.durationSec, ctx.rng),
    biquadCoeffs('bandpass', ctx.freqHz * 2, 1.5),
  );
  const out = createBuffer(ctx.durationSec);
  const attack = Math.min(0.06, ctx.durationSec * 0.25);
  const release = Math.min(0.1, ctx.durationSec * 0.3);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000;
    const env =
      t < attack
        ? t / attack
        : t > ctx.durationSec - release
          ? Math.max(0, (ctx.durationSec - t) / release)
          : 1;
    out[i] = ((tone[i] ?? 0) * 0.85 + (breath[i] ?? 0) * 0.15) * env;
  }
  applyGain(out, ctx.velocity * 0.7);
  return out;
}

/**
 * A đàn bầu-like monochord voice: the instrument's flute-pure harmonic tone (a sine with a touch of
 * 2nd/3rd harmonic), sliding into each note from a seeded bend above or below the way the player
 * flexes the rod, then a slow vibrato that blooms as the note sustains.
 */
function renderDanBau(ctx: NoteContext): Float32Array {
  const bendRoll = ctx.rng();
  const bendCents = bendRoll < 0.6 ? -160 : bendRoll < 0.85 ? 90 : 0;
  const glideSec = 0.14;
  const vibratoDelaySec = 0.35;
  const freqAt = (t: number): number => {
    const glide = t < glideSec ? 1 - t / glideSec : 0;
    const bend = bendCents * glide * glide;
    const depth = t < vibratoDelaySec ? 0 : Math.min(1, (t - vibratoDelaySec) / 0.5) * 22;
    const vibrato = depth * Math.sin(2 * Math.PI * 5.2 * (t - vibratoDelaySec));
    return ctx.freqHz * Math.pow(2, (bend + vibrato) / 1200);
  };
  const out = createBuffer(ctx.durationSec);
  mixInto(out, renderOscillator(ctx.durationSec, freqAt, 'sine'), 0.8);
  mixInto(
    out,
    renderOscillator(ctx.durationSec, (t) => freqAt(t) * 2, 'sine'),
    0.16,
  );
  mixInto(
    out,
    renderOscillator(ctx.durationSec, (t) => freqAt(t) * 3, 'sine'),
    0.05,
  );
  const attack = Math.min(0.015, ctx.durationSec * 0.2);
  const release = Math.min(0.1, ctx.durationSec * 0.3);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000;
    const shape = t < attack ? t / attack : Math.exp(-(t - attack) / 1.6);
    const tail = t > ctx.durationSec - release ? Math.max(0, (ctx.durationSec - t) / release) : 1;
    out[i] = (out[i] ?? 0) * shape * tail;
  }
  applyGain(out, ctx.velocity * 0.85);
  return out;
}

/** Renders one note for the given instrument. Every instrument is built from the shared DSP core. */
export function renderNote(instrument: InstrumentId, ctx: NoteContext): Float32Array {
  switch (instrument) {
    case 'gamelanMetallophone':
      return renderMetallophoneLike(ctx, METALLOPHONE_PARTIALS);
    case 'marimba':
      return renderMetallophoneLike(ctx, MARIMBA_PARTIALS);
    case 'koto':
      return renderPluckLike(ctx, { decay: 0.994, damping: 0.35 });
    case 'guitarPluck':
      return renderPluckLike(ctx, { decay: 0.996, damping: 0.28 });
    case 'charango':
      return renderPluckLike(ctx, { decay: 0.992, damping: 0.15 });
    case 'danTranh':
      return renderPluckLike(ctx, { decay: 0.995, damping: 0.22 });
    case 'danBau':
      return renderDanBau(ctx);
    case 'woodBlock':
      return renderMetallophoneLike(ctx, WOOD_BLOCK_PARTIALS);
    case 'reed':
      return renderReed(ctx);
    case 'panFlute':
      return renderPanFlute(ctx);
    default:
      return renderMetallophoneLike(ctx, METALLOPHONE_PARTIALS);
  }
}
