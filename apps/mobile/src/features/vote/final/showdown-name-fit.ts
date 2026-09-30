/**
 * How the showdown's two city names give up height before anything scrolls (3c-1). Both start at
 * their designed size; when the two halves' content fits the screen there, nothing changes. When
 * it doesn't, both names are set at one shared size (the same line height, so neither finalist
 * gets smaller billing): the largest at which both halves fit, found by a binary search over the
 * measured layout, never below the 44 pt floor, and never so small that a word breaks.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';

/** Smallest a city name is set at when its half runs out of height (Vietnamese chips wrap taller). */
export const NAME_FLOOR = 44;
const SEARCH_STEPS = 24;

/** One half's name as designed (measured while it is set at its designed size) and now. */
export interface NameMeasure {
  readonly designHeight: number;
  readonly designWidth: number;
  /** Line height and line count at the designed size. */
  readonly designLine: number;
  readonly designLines: number;
  /** The name's height as it is set right now. */
  readonly height: number;
  /** Lines the name is set on right now (more than designed: a word broke or the name reflowed). */
  readonly lines: number;
}

export interface HalfMeasure {
  readonly name: NameMeasure;
  /** The height the half's content needs, as it is set right now. */
  readonly natural: number;
}

function measured(half: HalfMeasure): boolean {
  const { name } = half;
  return name.designHeight > 0 && name.designWidth > 0 && name.designLine > 0 && half.natural > 0;
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
  readonly low: number;
  readonly high: number;
  /** `low` broke a name (a word split, a many-word name reflowed): not a size to settle on. */
  readonly lowBroke: boolean;
  readonly done: boolean;
}

export const DESIGN_SEARCH: NameSearch = {
  line: null,
  low: 0,
  high: 0,
  lowBroke: true,
  done: false,
};

/** Search steps stop once the bracket is this narrow (points of line height). */
const SEARCH_TOLERANCE = 2;

/**
 * One step, after the layout at `search.line` settled and was measured. `fits`: both halves fit
 * the viewport; `broke`: a name is set on more lines than designed (auto-fit hit the 44 pt floor
 * and split a word, or reflowed a many-word name). At the designed size a fit ends the search with
 * nothing changed; otherwise it bisects, starting from the model's guess: a fit or a broken name
 * goes larger, an overflow smaller. It ends on the largest size that fitted with every name whole,
 * or, when none did, the smallest whole size (what still does not fit scrolls).
 */
export function nextNameSearch(
  search: NameSearch,
  fits: boolean,
  broke: boolean,
  guess: number,
  top: number,
): NameSearch {
  if (search.done) return search;
  if (search.line === null) {
    if (fits) return { ...search, done: true };
    return { line: Math.min(guess, top), low: 0, high: top, lowBroke: true, done: false };
  }
  const larger = fits || broke;
  const next = {
    low: larger ? search.line : search.low,
    lowBroke: larger ? broke : search.lowBroke,
    high: larger ? search.high : search.line,
  };
  if (next.high - next.low <= SEARCH_TOLERANCE)
    return { ...next, line: next.lowBroke ? next.high : next.low, done: true };
  return { ...next, line: (next.low + next.high) / 2, done: false };
}

/** The box a name is set in at `scale` of its designed size, or null at the designed size. */
export function nameBox(name: NameMeasure, scale: number): number | null {
  return scale >= 0.995 ? null : name.designWidth * scale;
}

/**
 * Measures one half's name: its designed size while it is set uncapped (`cap` null) and its
 * height as set. No line count is forced: Android reports an ellipsised line as the whole text,
 * so auto-fit would never see the cut.
 */
export function useNameMeasure(name: string, locale: string, cap: number | null) {
  const key = `${name}|${locale}`;
  const [now, setNow] = useState({ height: 0, width: 0, line: 0, lines: 0 });
  const [design, setDesign] = useState({ key, height: 0, width: 0, line: 0, lines: 0 });
  // Adjusted while rendering (not in an effect) so a new name starts from its own design size.
  if (design.key !== key) {
    setDesign({ key, height: 0, width: 0, line: 0, lines: 0 });
  } else if (
    cap === null &&
    now.height > 0 &&
    now.width > 0 &&
    now.line > 0 &&
    (design.height !== now.height ||
      design.width !== now.width ||
      design.line !== now.line ||
      design.lines !== now.lines)
  ) {
    setDesign({ key, ...now });
  }
  const measure: NameMeasure = {
    designHeight: design.height,
    designWidth: design.width,
    designLine: design.line,
    designLines: design.lines,
    height: now.height,
    lines: now.lines,
  };
  return {
    measure,
    onLayout: (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      setNow((m) => (m.height === height ? m : { ...m, height }));
    },
    onTextLayout: (event: TextLayoutEvent) => {
      const { lines } = event.nativeEvent;
      const width = Math.max(0, ...lines.map((line) => line.width));
      const line = lines[0]?.height ?? 0;
      setNow((m) =>
        m.width === width && m.line === line && m.lines === lines.length
          ? m
          : { ...m, width, line, lines: lines.length },
      );
    },
  };
}

const NO_NAME: NameMeasure = {
  designHeight: 0,
  designWidth: 0,
  designLine: 0,
  designLines: 0,
  height: 0,
  lines: 0,
};
const NO_HALF: HalfMeasure = { name: NO_NAME, natural: 0 };

/** How long the layout must stay still before a search step reads it. */
const SETTLE_MS = 120;

/**
 * Collects both halves' measures and the viewport and gives each half its name box. The names
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
  useEffect(() => {
    if (!ready || step.done) return undefined;
    // Every new measurement restarts the wait, so a step reads a layout that has settled.
    const timer = setTimeout(() => {
      const fits = halves[0].natural + halves[1].natural <= viewport + 0.5;
      const broke = halves.some((half) => half.name.lines > half.name.designLines);
      const guess = guessNameLine(halves, viewport) ?? topLine(halves);
      setSearch((current) =>
        current.key === key && current.viewport === viewport
          ? { ...current, step: nextNameSearch(current.step, fits, broke, guess, topLine(halves)) }
          : current,
      );
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, step, halves, viewport, key]);
  const [first, second] = scalesAt(halves, step.line);
  const searching = step.line !== null && !step.done;
  const box = (index: 0 | 1, scale: number) => ({ nameCap: nameBox(halves[index].name, scale) });
  return {
    onViewport: setViewport,
    first: {
      ...box(0, first),
      nameHidden: searching,
      onNaturalHeight: onFirstNatural,
      onNameMeasure: onFirstName,
    },
    second: {
      ...box(1, second),
      nameHidden: searching,
      onNaturalHeight: onSecondNatural,
      onNameMeasure: onSecondName,
    },
  };
}
