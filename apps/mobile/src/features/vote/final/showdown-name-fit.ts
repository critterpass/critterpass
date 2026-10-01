/**
 * How the showdown's two city names give up height before anything scrolls (3c-1). Each starts as
 * large as the render sets it, or as large as its longest word fits its half; when the two halves'
 * content fits the screen there, nothing changes. When it doesn't, both names are capped at one
 * shared line height (so neither finalist gets smaller billing): the largest at which both halves
 * fit, found by a binary search over the measured layout and never below the 44 pt floor. What
 * still does not fit there scrolls.
 */
import { useCallback, useEffect, useState } from 'react';

/** Smallest a city name is set at when its half runs out of height (Vietnamese chips wrap taller). */
const NAME_FLOOR = 44;
const SEARCH_STEPS = 24;

/** One half's name: as set when only its half's width limits it, and now. */
export interface NameMeasure {
  readonly designHeight: number;
  /** Line height when only the half's width limits the name. */
  readonly designLine: number;
  /** The name's height as it is set right now. */
  readonly height: number;
}

export interface HalfMeasure {
  readonly name: NameMeasure;
  /** The height the half's content needs, as it is set right now. */
  readonly natural: number;
}

function measured(half: HalfMeasure): boolean {
  const { name } = half;
  return name.designHeight > 0 && name.designLine > 0 && half.natural > 0;
}

function scaleAt(name: NameMeasure, line: number): number {
  return Math.min(1, line / name.designLine);
}

/**
 * A first guess at the shared line height, from a straight-line model of the measured layout (a
 * name's height scales with its size, the rest of the half stays): the largest that fits, or 0.
 * Null when the halves fit at their designed size. The search below
 * checks it against the real layout, which the model can miss (auto-fit, line breaks).
 */
export function guessNameLine(
  halves: readonly [HalfMeasure, HalfMeasure],
  viewport: number,
): number | null {
  if (viewport <= 0 || !halves.every(measured)) return null;
  const rest = halves.reduce((sum, half) => sum + half.natural - half.name.height, 0);
  const total = (line: number) =>
    halves.reduce((sum, half) => sum + half.name.designHeight * scaleAt(half.name, line), rest);
  const top = topLine(halves);
  if (total(top) <= viewport) return null;
  let low = 0;
  let high = top;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (total(mid) <= viewport) low = mid;
    else high = mid;
  }
  return low;
}

function topLine(halves: readonly HalfMeasure[]): number {
  return Math.max(...halves.map((half) => half.name.designLine));
}

/** Both names' scale (1 = designed size) at a shared line height, or at their designed size. */
export function scalesAt(
  halves: readonly [HalfMeasure, HalfMeasure],
  line: number | null,
): readonly [number, number] {
  if (line === null || !halves.every(measured)) return [1, 1];
  return [scaleAt(halves[0].name, line), scaleAt(halves[1].name, line)];
}

/** Where the search for the shared line height stands: `line` null is the designed size. */
export interface NameSearch {
  readonly line: number | null;
  /** The largest line height known to fit, or the floor while none is. */
  readonly low: number;
  /** The smallest line height known to overflow. */
  readonly high: number;
  readonly done: boolean;
}

export const DESIGN_SEARCH: NameSearch = { line: null, low: 0, high: 0, done: false };

/** Search steps stop once the bracket is this narrow (points of line height). */
const SEARCH_TOLERANCE = 4;

/**
 * One step, after the layout at `search.line` settled and was measured; `fits`: both halves fit
 * the viewport, with `spare` points of it left over. At the designed size a fit ends the search with nothing changed; otherwise it
 * bisects between the floor and the designed size, starting from the model's guess: a fit goes
 * larger, an overflow smaller. It ends on the largest size that fitted or, when none did, on the
 * floor (what still does not fit scrolls).
 */
export function nextNameSearch(
  search: NameSearch,
  fits: boolean,
  guess: number,
  top: number,
  spare = Number.POSITIVE_INFINITY,
): NameSearch {
  if (search.done) return search;
  if (search.line === null) {
    if (fits) return { ...search, done: true };
    const floor = Math.min(NAME_FLOOR, top);
    // Start from the model's guess, which is usually close; the bracket is the whole range.
    const line = Math.min(top, Math.max(floor, guess));
    return { line, low: floor, high: top, done: line <= floor };
  }
  const low = fits ? search.line : search.low;
  const high = fits ? search.high : search.line;
  // A size that fits with next to nothing to spare is the largest that fits: stop there.
  const close = fits && spare <= SEARCH_TOLERANCE * 2;
  if (close || high - low <= SEARCH_TOLERANCE) return { line: low, low, high, done: true };
  return { line: (low + high) / 2, low, high, done: false };
}

const NO_NAME: NameMeasure = { designHeight: 0, designLine: 0, height: 0 };
const NO_HALF: HalfMeasure = { name: NO_NAME, natural: 0 };

/** How long the layout must stay still before a search step reads it. */
const SETTLE_MS = 200;

/**
 * Collects both halves' measures and the viewport and gives each half its name's scale. The names
 * start at their designed size; only when the halves overflow does it search the real layout for
 * the largest shared size that fits, one settled layout per step, the names hidden meanwhile.
 */
export function useShowdownNames(key: string) {
  const [viewport, setViewport] = useState(0);
  const [halves, setHalves] = useState<readonly [HalfMeasure, HalfMeasure]>([NO_HALF, NO_HALF]);
  const [search, setSearch] = useState({ key, viewport, step: DESIGN_SEARCH });
  // A new pair of names, a new language or a new screen size starts again from the design size.
  if (search.key !== key || search.viewport !== viewport)
    setSearch({ key, viewport, step: DESIGN_SEARCH });
  const update = useCallback((index: 0 | 1, change: Partial<HalfMeasure>) => {
    setHalves((current) => {
      const next = { ...current[index], ...change };
      return index === 0 ? [next, current[1]] : [current[0], next];
    });
  }, []);
  const onFirstNatural = useCallback((natural: number) => update(0, { natural }), [update]);
  const onSecondNatural = useCallback((natural: number) => update(1, { natural }), [update]);
  const onFirstName = useCallback((name: NameMeasure) => update(0, { name }), [update]);
  const onSecondName = useCallback((name: NameMeasure) => update(1, { name }), [update]);
  const ready = viewport > 0 && halves.every(measured);
  const { step } = search;
  const fits = halves[0].natural + halves[1].natural <= viewport + 0.5;
  // Names that settled at their designed size search again when a half grows past the screen
  // afterwards (a pitch's line and chips arriving late).
  const settled = step.done && (step.line !== null || fits);
  useEffect(() => {
    if (!ready || settled) return undefined;
    // Every new measurement restarts the wait, so a step reads a layout that has settled.
    const timer = setTimeout(() => {
      const guess = guessNameLine(halves, viewport) ?? topLine(halves);
      setSearch((current) =>
        current.key === key && current.viewport === viewport
          ? {
              ...current,
              step: nextNameSearch(
                current.step.done ? DESIGN_SEARCH : current.step,
                fits,
                guess,
                topLine(halves),
                viewport - halves[0].natural - halves[1].natural,
              ),
            }
          : current,
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, settled, step, halves, viewport, key, fits]);
  const [first, second] = scalesAt(halves, step.line);
  const searching = step.line !== null && !step.done;
  return {
    onViewport: setViewport,
    first: {
      nameScale: first,
      nameHidden: searching,
      onNaturalHeight: onFirstNatural,
      onNameMeasure: onFirstName,
    },
    second: {
      nameScale: second,
      nameHidden: searching,
      onNaturalHeight: onSecondNatural,
      onNameMeasure: onSecondName,
    },
  };
}
