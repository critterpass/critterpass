/**
 * The server clock as this phone sees it, for shared moments such as a quest reward that spins
 * onto every phone at once. Each realtime envelope carries the server time it was written; the
 * difference to the moment it arrived is the clock offset minus that message's transit, so the
 * largest difference among recent messages (the fastest one) is the closest estimate. A reveal
 * scheduled at `reveal_at - offset` on the local clock lands at the same instant on every phone,
 * whatever each phone's own clock says.
 */

/** Samples kept (the most recent). */
const MAX_SAMPLES = 24;
/** Samples older than this stop counting: phone clocks drift and get corrected. */
const SAMPLE_TTL_MS = 30 * 60_000;

interface Sample {
  readonly offsetMs: number;
  readonly atLocal: number;
}

export interface ServerClock {
  /** Records one message: the server time it carries, and the local time it arrived. */
  observe(serverTs: string | number, localReceivedMs: number): void;
  /** Server time minus local time, in ms; 0 until a message has arrived. */
  offset(nowLocal: number): number;
  /** The local clock time at which a server instant happens. */
  toLocal(serverTs: string | number, nowLocal: number): number;
}

const toMs = (ts: string | number): number => (typeof ts === 'number' ? ts : Date.parse(ts));

export function createServerClock(): ServerClock {
  let samples: Sample[] = [];
  const fresh = (nowLocal: number) =>
    samples.filter((sample) => nowLocal - sample.atLocal <= SAMPLE_TTL_MS);
  const clock: ServerClock = {
    observe(serverTs, localReceivedMs) {
      const server = toMs(serverTs);
      if (!Number.isFinite(server)) return;
      samples = [
        ...fresh(localReceivedMs),
        { offsetMs: server - localReceivedMs, atLocal: localReceivedMs },
      ].slice(-MAX_SAMPLES);
    },
    offset(nowLocal) {
      const recent = fresh(nowLocal);
      if (recent.length === 0) return 0;
      return Math.max(...recent.map((sample) => sample.offsetMs));
    },
    toLocal(serverTs, nowLocal) {
      return toMs(serverTs) - clock.offset(nowLocal);
    },
  };
  return clock;
}

/** The app's one server clock (realtime envelopes feed it as they arrive). */
export const serverClock = createServerClock();

/**
 * How long to wait before revealing: until `revealAt` on the server clock, or now when that moment
 * has already passed (a late opener sees the reward straight away, without the spin).
 */
export function revealDelay(
  clock: ServerClock,
  revealAt: string,
  nowLocal: number,
): { readonly delayMs: number; readonly late: boolean } {
  const fireAt = clock.toLocal(revealAt, nowLocal);
  const delayMs = fireAt - nowLocal;
  return delayMs <= 0 ? { delayMs: 0, late: delayMs < -2_000 } : { delayMs, late: false };
}

export type RevealMode = 'spin' | 'static';

export interface RevealPlan {
  readonly delayMs: number;
  readonly mode: RevealMode;
  /** The haptic plays at the moment itself, never for a late opener. */
  readonly haptic: boolean;
}

/** When and how a reward shows: spun at the shared moment, or static (late, or Reduce Motion). */
export function planReveal(
  clock: ServerClock,
  revealAt: string,
  nowLocal: number,
  reduceMotion: boolean,
): RevealPlan {
  const { delayMs, late } = revealDelay(clock, revealAt, nowLocal);
  return { delayMs, mode: late || reduceMotion ? 'static' : 'spin', haptic: !late };
}
