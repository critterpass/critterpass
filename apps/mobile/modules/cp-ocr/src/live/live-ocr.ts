import type { OcrQualityIssue, OcrResult, OcrStatus } from '../types';
import { createLineTracker, type LineTracker, type LiveLine } from './track-lines';

/** One processed camera frame: the lines with stable ids, and whether the view has settled. */
export interface LiveFrame {
  readonly status: OcrStatus;
  readonly lines: readonly LiveLine[];
  readonly quality: OcrQualityIssue | null;
  /** True once most lines have held their id for a few frames: the moment to ask the server. */
  readonly stable: boolean;
  /** The still the lines were read from; the server crop is cut from it on lock. */
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export interface LiveOcrOptions {
  /**
   * A still of what the camera shows now, as a file URI (vision-camera's `takeSnapshot`), or null
   * when the camera has nothing yet. Debug builds can pass {@link fixtureFrames} instead.
   */
  readonly capture: () => Promise<string | null>;
  /** The still-image recogniser (`getOcr().recognize`). */
  readonly recognize: (uri: string) => Promise<OcrResult>;
  readonly onFrame: (frame: LiveFrame) => void;
  readonly onError?: (error: unknown) => void;
  /** Frames a second, 1 to 5 (default 3): recognition of one still takes 100–300 ms on device. */
  readonly fps?: number;
  readonly tracker?: LineTracker;
  /** Frames a line must hold its id before it counts as settled (default 3). */
  readonly settleFrames?: number;
}

export interface LiveOcr {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Share of lines that must have settled for the frame to count as stable. */
const STABLE_SHARE = 0.8;

/**
 * Live text for point-and-ask: a throttled loop of camera stills through the on-device
 * recogniser, one at a time (a slow frame delays the next instead of piling up), with every line
 * tracked to a stable id across frames.
 */
export function createLiveOcr(options: LiveOcrOptions): LiveOcr {
  const fps = Math.min(5, Math.max(1, options.fps ?? 3));
  const interval = 1000 / fps;
  const settle = options.settleFrames ?? 3;
  const tracker = options.tracker ?? createLineTracker();
  let generation = 0;
  let running = false;

  const loop = async (mine: number) => {
    while (running && mine === generation) {
      const started = Date.now();
      try {
        const uri = await options.capture();
        if (uri !== null && running && mine === generation) {
          const result = await options.recognize(uri);
          if (!running || mine !== generation) return;
          const lines = tracker.update(result.lines);
          const settled = lines.filter((line) => line.seen >= settle).length;
          options.onFrame({
            status: result.status,
            lines,
            quality: result.quality,
            stable: lines.length > 0 && settled / lines.length >= STABLE_SHARE,
            uri,
            width: result.width,
            height: result.height,
          });
        }
      } catch (error) {
        options.onError?.(error);
      }
      await wait(Math.max(0, interval - (Date.now() - started)));
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      generation += 1;
      tracker.reset();
      void loop(generation);
    },
    stop() {
      running = false;
      generation += 1;
    },
    get running() {
      return running;
    },
  };
}

/**
 * Debug and development builds: replays still images (a recorded menu walk, frame by frame) in
 * place of the camera, for the simulator and Maestro, which have no camera to point.
 */
export function fixtureFrames(uris: readonly string[]): () => Promise<string | null> {
  let index = 0;
  return () => {
    if (uris.length === 0) return Promise.resolve(null);
    const uri = uris[index % uris.length]!;
    index += 1;
    return Promise.resolve(uri);
  };
}
