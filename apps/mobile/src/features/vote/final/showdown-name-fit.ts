/**
 * How the showdown's two city names give up height before anything scrolls (3c-1). Both start at
 * their designed size; when the two halves' content fits the screen there, nothing changes. When
 * it doesn't, both names are set at one shared size (the same line height, so neither finalist
 * gets smaller billing): the largest at which both halves fit, found by a binary search over the
 * measured layout, never below the 44 pt floor, and never so narrow that the longest word breaks.
 */
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';

/** Smallest a city name is set at when its half runs out of height (Vietnamese chips wrap taller). */
export const NAME_FLOOR = 44;
/** The display token's line height as a share of its font size. */
const NAME_LINE_EM = 0.8;
/** Width of one condensed display capital per point of font size, with room to spare (M and H set about 0.45). */
const CAPITAL_EM = 0.55;
const SEARCH_STEPS = 24;

/** One half's name as designed (measured while it is set at its designed size) and now. */
export interface NameMeasure {
  readonly designHeight: number;
  readonly designWidth: number;
  /** Line height at the designed size. */
  readonly designLine: number;
  /** The name's height as it is set right now. */
  readonly height: number;
  /** Characters in the name's longest word. */
  readonly longestWord: number;
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

/** The smallest share of its designed size a name may take: the 44 pt floor, and its longest word whole. */
function floorScale(name: NameMeasure): number {
  const font = NAME_FLOOR / (name.designLine / NAME_LINE_EM);
  const word = (name.longestWord * NAME_FLOOR * CAPITAL_EM) / name.designWidth;
  return Math.min(1, Math.max(font, word));
}

function scaleAt(name: NameMeasure, line: number): number {
  return Math.min(1, Math.max(line / name.designLine, floorScale(name)));
}

/**
 * Each half's name scale (1 = designed size): both at their designed size when the halves fit the
 * viewport there; otherwise both at the largest shared line height that fits, or at their floors.
 */
export function sharedNameScales(
  halves: readonly [HalfMeasure, HalfMeasure],
  viewport: number,
): readonly [number, number] {
  if (viewport <= 0 || !halves.every(measured)) return [1, 1];
  // What each half needs besides its name does not change with the name's size.
  const rest = halves.reduce((sum, half) => sum + half.natural - half.name.height, 0);
  const total = (line: number) =>
    halves.reduce((sum, half) => sum + half.name.designHeight * scaleAt(half.name, line), rest);
  const top = Math.max(...halves.map((half) => half.name.designLine));
  const scales = (line: number) =>
    [scaleAt(halves[0].name, line), scaleAt(halves[1].name, line)] as const;
  if (total(top) <= viewport) return [1, 1];
  let low = 0;
  let high = top;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const mid = (low + high) / 2;
    if (total(mid) <= viewport) low = mid;
    else high = mid;
  }
  return scales(low);
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
  const longestWord = Math.max(0, ...name.split(/\s+/u).map((word) => [...word].length));
  const [now, setNow] = useState({ height: 0, width: 0, line: 0 });
  const [design, setDesign] = useState({ key, height: 0, width: 0, line: 0 });
  // Adjusted while rendering (not in an effect) so a new name starts from its own design size.
  if (design.key !== key) {
    setDesign({ key, height: 0, width: 0, line: 0 });
  } else if (
    cap === null &&
    now.height > 0 &&
    now.width > 0 &&
    now.line > 0 &&
    (design.height !== now.height || design.width !== now.width || design.line !== now.line)
  ) {
    setDesign({ key, ...now });
  }
  const measure: NameMeasure = {
    designHeight: design.height,
    designWidth: design.width,
    designLine: design.line,
    height: now.height,
    longestWord,
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
      setNow((m) => (m.width === width && m.line === line ? m : { ...m, width, line }));
    },
  };
}

const NO_NAME: NameMeasure = {
  designHeight: 0,
  designWidth: 0,
  designLine: 0,
  height: 0,
  longestWord: 0,
};
const NO_HALF: HalfMeasure = { name: NO_NAME, natural: 0 };

/** Collects both halves' measures and the viewport, and gives each half its name box. */
export function useShowdownNames() {
  const [viewport, setViewport] = useState(0);
  const [halves, setHalves] = useState<readonly [HalfMeasure, HalfMeasure]>([NO_HALF, NO_HALF]);
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
  const [first, second] = sharedNameScales(halves, viewport);
  return {
    onViewport: setViewport,
    first: {
      nameCap: nameBox(halves[0].name, first),
      onNaturalHeight: onFirstNatural,
      onNameMeasure: onFirstName,
    },
    second: {
      nameCap: nameBox(halves[1].name, second),
      onNaturalHeight: onSecondNatural,
      onNameMeasure: onSecondName,
    },
  };
}
