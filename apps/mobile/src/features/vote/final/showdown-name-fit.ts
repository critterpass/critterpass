/**
 * How the showdown's two city names give up height before anything scrolls (3c-1). Each starts at
 * the render's size, or as large as its longest word fits its half; when the two halves fit the
 * screen there, nothing changes. When they don't, both names are capped at one shared type size (so
 * neither finalist gets smaller billing, plain or marked): the largest at which both halves fit,
 * never below the 44 pt floor. What still does not fit there scrolls.
 *
 * The size is worked out in one pass from what the halves measure: a name's height at any size
 * follows from its words' widths (a smaller name takes fewer lines) and the rest of a half (its
 * paddings, the guide's line, the chips, the voters) does not change, so no layout has to be tried
 * and the names are never set at one size and then at another.
 */
import { useCallback, useState } from 'react';

/** Smallest a city name is set at when its half runs out of height (Vietnamese chips wrap taller). */
const NAME_FLOOR = 44;
const SEARCH_STEPS = 24;

/** One half's name as set when only its half's width limits it. */
export interface NameMeasure {
  /** Its box's height. */
  readonly designHeight: number;
  /** Its type size. */
  readonly designLine: number;
  /**
   * Its box's height at `scale` of that size, when it is known more closely than a straight
   * scaling of `designHeight`: a name on several lines takes fewer when it is set smaller.
   */
  readonly heightAt?: (scale: number) => number;
}

export interface HalfMeasure {
  readonly name: NameMeasure;
  /** The height the half needs for everything but its name. */
  readonly rest: number;
}

function measured(half: HalfMeasure): boolean {
  return half.name.designHeight > 0 && half.name.designLine > 0 && half.rest > 0;
}

function scaleAt(name: NameMeasure, line: number): number {
  return Math.min(1, line / name.designLine);
}

function nameHeight(name: NameMeasure, scale: number): number {
  return name.heightAt?.(scale) ?? name.designHeight * scale;
}

/**
 * The type size both names share: null when the halves fit the screen with each name at its
 * designed size, otherwise the largest at which they fit, or the floor when none does.
 */
export function sharedNameLine(
  halves: readonly [HalfMeasure, HalfMeasure],
  viewport: number,
): number | null {
  if (viewport <= 0 || !halves.every(measured)) return null;
  const rest = halves.reduce((sum, half) => sum + half.rest, 0);
  const total = (line: number) =>
    halves.reduce((sum, half) => sum + nameHeight(half.name, scaleAt(half.name, line)), rest);
  const top = Math.max(...halves.map((half) => half.name.designLine));
  if (total(top) <= viewport) return null;
  let low = 0;
  let high = top;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (total(mid) <= viewport) low = mid;
    else high = mid;
  }
  return Math.max(low, Math.min(NAME_FLOOR, top));
}

/** Both names' scale (1 = designed size) at a shared type size, or at their designed size. */
export function scalesAt(
  halves: readonly [HalfMeasure, HalfMeasure],
  line: number | null,
): readonly [number, number] {
  if (line === null || !halves.every(measured)) return [1, 1];
  return [scaleAt(halves[0].name, line), scaleAt(halves[1].name, line)];
}

const NO_HALF: HalfMeasure = { name: { designHeight: 0, designLine: 0 }, rest: 0 };
const NO_HALVES: readonly [HalfMeasure, HalfMeasure] = [NO_HALF, NO_HALF];

/**
 * Collects both halves' measures and the viewport and gives each half its name's scale. The names
 * stay hidden (their room kept) for the first layouts, until both halves are measured, and then
 * appear at the size they keep; a half that grows later (a pitch's chips arriving) resizes them in
 * place.
 */
export function useShowdownNames(key: string) {
  const [viewport, setViewport] = useState(0);
  const [held, setHeld] = useState({ key, halves: NO_HALVES });
  // A new pair of names or a new language is measured afresh.
  if (held.key !== key) setHeld({ key, halves: NO_HALVES });
  const halves = held.key === key ? held.halves : NO_HALVES;
  const update = useCallback(
    (index: 0 | 1, change: Partial<HalfMeasure>) => {
      setHeld((now) => {
        const current = now.key === key ? now.halves : NO_HALVES;
        const before = current[index];
        const next = { ...before, ...change };
        if (
          now.key === key &&
          next.rest === before.rest &&
          next.name.designHeight === before.name.designHeight &&
          next.name.designLine === before.name.designLine &&
          next.name.heightAt === before.name.heightAt
        ) {
          return now;
        }
        return { key, halves: index === 0 ? [next, current[1]] : [current[0], next] };
      });
    },
    [key],
  );
  const onFirstRest = useCallback((rest: number) => update(0, { rest }), [update]);
  const onSecondRest = useCallback((rest: number) => update(1, { rest }), [update]);
  const onFirstName = useCallback((name: NameMeasure) => update(0, { name }), [update]);
  const onSecondName = useCallback((name: NameMeasure) => update(1, { name }), [update]);
  const ready = viewport > 0 && halves.every(measured);
  const [first, second] = scalesAt(halves, ready ? sharedNameLine(halves, viewport) : null);
  return {
    onViewport: setViewport,
    /** Both names are measured and set at the size they keep. */
    settled: ready,
    first: {
      nameScale: first,
      nameHidden: !ready,
      onRest: onFirstRest,
      onNameMeasure: onFirstName,
    },
    second: {
      nameScale: second,
      nameHidden: !ready,
      onRest: onSecondRest,
      onNameMeasure: onSecondName,
    },
  };
}
