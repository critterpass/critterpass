import type { OcrBox } from '../types';

/** One line the recogniser read in one camera frame (`bbox` normalised, top-left origin). */
export interface LiveObservation {
  readonly text: string;
  readonly bbox: OcrBox;
  readonly conf: number;
}

/**
 * A line on screen with an id that stays the same while the camera keeps it in view, so the
 * stickers and the server's translations (keyed by `ocr_line_id`) stay on the right dish.
 */
export interface LiveLine {
  readonly id: string;
  readonly text: string;
  readonly bbox: OcrBox;
  readonly conf: number;
  /** Frames this line has been seen in; a sticker waits for a line that has settled. */
  readonly seen: number;
}

export interface TrackOptions {
  /** Box overlap (after the camera's own motion is taken out) that keeps a line's id. */
  readonly minIou?: number;
  /** Frames a line in view may go unread (glare, a finger) and still come back with its id. */
  readonly maxMissed?: number;
  /** Frames a line the camera panned away from is remembered, to keep its id when it returns. */
  readonly maxOutOfView?: number;
}

export interface LineTracker {
  /** The lines of this frame, each with its stable id. */
  update(observations: readonly LiveObservation[]): readonly LiveLine[];
  reset(): void;
}

interface Track {
  id: string;
  text: string;
  key: string;
  bbox: OcrBox;
  conf: number;
  seen: number;
  missed: number;
  away: number;
}

/** Case, accents and spacing differ between frames of the same line; compare without them. */
function keyOf(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function iou(a: OcrBox, b: OcrBox): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const overlap = x * y;
  const union = a[2] * a[3] + b[2] * b[3] - overlap;
  return union > 0 ? overlap / union : 0;
}

/** Share of character bigrams in common (Dice), robust to the recogniser's one-letter slips. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const left = grams.get(gram) ?? 0;
    if (left > 0) {
      shared += 1;
      grams.set(gram, left - 1);
    }
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((p, q) => p - q);
  const mid = Math.floor(sorted.length / 2);
  const at = (index: number) => sorted[index] ?? 0;
  return sorted.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
}

function shift(box: OcrBox, dx: number, dy: number): OcrBox {
  return [box[0] + dx, box[1] + dy, box[2], box[3]];
}

/** Wholly in the frame: a line cut by the edge is not read, which is not a misread. */
function inView(box: OcrBox): boolean {
  return box[0] >= 0 && box[1] >= 0 && box[0] + box[2] <= 1 && box[1] + box[3] <= 1;
}

function centre(box: OcrBox): [number, number] {
  return [box[0] + box[2] / 2, box[1] + box[3] / 2];
}

/**
 * The camera's own motion between frames: the median move of lines whose text is unmistakably
 * the same (unique in both frames). Panning over a menu at a few frames a second moves every box
 * further than its height, so plain overlap would hand out new ids on every frame.
 */
function cameraMotion(
  tracks: readonly Track[],
  observed: readonly { key: string; bbox: OcrBox }[],
) {
  const count = (keys: readonly string[]) => {
    const seen = new Map<string, number>();
    for (const key of keys) seen.set(key, (seen.get(key) ?? 0) + 1);
    return seen;
  };
  const trackKeys = count(tracks.map((t) => t.key));
  const observedKeys = count(observed.map((o) => o.key));
  const dx: number[] = [];
  const dy: number[] = [];
  for (const track of tracks) {
    if (track.key.length < 3 || trackKeys.get(track.key) !== 1) continue;
    if (observedKeys.get(track.key) !== 1) continue;
    const match = observed.find((o) => o.key === track.key);
    if (match === undefined) continue;
    const [tx, ty] = centre(track.bbox);
    const [ox, oy] = centre(match.bbox);
    dx.push(ox - tx);
    dy.push(oy - ty);
  }
  return { dx: median(dx), dy: median(dy) };
}

/** Half way to the new box: stickers follow the line without shaking with the hand. */
function blend(from: OcrBox, to: OcrBox): OcrBox {
  const mix = (a: number, b: number) => a + (b - a) * 0.5;
  return [mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2]), mix(from[3], to[3])];
}

export function createLineTracker(options: TrackOptions = {}): LineTracker {
  const minIou = options.minIou ?? 0.3;
  const maxMissed = options.maxMissed ?? 3;
  const maxOutOfView = options.maxOutOfView ?? 15;
  let tracks: Track[] = [];
  let next = 0;

  return {
    update(observations) {
      const observed = observations.map((o) => ({ ...o, key: keyOf(o.text) }));
      const motion = cameraMotion(tracks, observed);

      const pairs: { track: number; obs: number; score: number }[] = [];
      tracks.forEach((track, t) => {
        const moved = shift(track.bbox, motion.dx, motion.dy);
        observed.forEach((obs, o) => {
          const overlap = iou(moved, obs.bbox);
          const text = similarity(track.key, obs.key);
          if (overlap >= minIou || (overlap > 0.05 && text >= 0.75)) {
            pairs.push({ track: t, obs: o, score: overlap * 0.6 + text * 0.4 });
          }
        });
      });
      pairs.sort((p, q) => q.score - p.score);

      const trackTaken = new Set<number>();
      const obsTaken = new Map<number, Track>();
      for (const pair of pairs) {
        if (trackTaken.has(pair.track) || obsTaken.has(pair.obs)) continue;
        trackTaken.add(pair.track);
        const track = tracks[pair.track];
        const obs = observed[pair.obs];
        if (track === undefined || obs === undefined) continue;
        const moved = shift(track.bbox, motion.dx, motion.dy);
        track.bbox = blend(moved, obs.bbox);
        // A clearer read replaces the text; a worse one (motion blur) keeps the last good one.
        if (obs.conf >= track.conf * 0.9) {
          track.text = obs.text;
          track.key = obs.key;
          track.conf = obs.conf;
        }
        track.seen += 1;
        track.missed = 0;
        track.away = 0;
        obsTaken.set(pair.obs, track);
      }

      tracks.forEach((track, t) => {
        if (trackTaken.has(t)) return;
        track.bbox = shift(track.bbox, motion.dx, motion.dy);
        if (inView(track.bbox)) track.missed += 1;
        else track.away += 1;
      });
      tracks = tracks.filter((track) => track.missed <= maxMissed && track.away <= maxOutOfView);

      observed.forEach((obs, o) => {
        if (obsTaken.has(o)) return;
        const track: Track = {
          id: `v${next}`,
          text: obs.text,
          key: obs.key,
          bbox: obs.bbox,
          conf: obs.conf,
          seen: 1,
          missed: 0,
          away: 0,
        };
        next += 1;
        tracks.push(track);
        obsTaken.set(o, track);
      });

      // Every observation has its track by now (matched or new), in the order it was read.
      return observed.flatMap((_, o) => {
        const track = obsTaken.get(o);
        if (track === undefined) return [];
        const { id, text, bbox, conf, seen } = track;
        return [{ id, text, bbox, conf, seen }];
      });
    },
    reset() {
      tracks = [];
    },
  };
}
