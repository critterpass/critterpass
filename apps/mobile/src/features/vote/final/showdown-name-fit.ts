/**
 * How a showdown half's city name gives up height before anything scrolls (3c-1): the name keeps
 * its designed size while its half fits, and otherwise is set in a fixed, narrower box that
 * auto-fit shrinks it to.
 */
import { useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';

/** Smallest the city name shrinks to when its half runs out of height (Vietnamese chips wrap taller). */
export const NAME_FLOOR = 44;
/** The name never shrinks below this share of its designed size. */
const MIN_NAME_SCALE = 0.45;
/** Width of one condensed display capital per point of font size, with room to spare (M and H set about 0.45). */
const CAPITAL_EM = 0.55;

export interface NameFit {
  readonly key: string;
  /** The box width this half alone needs to fit its share, or null when it fits as designed. */
  readonly need: number | null;
  /** The name's designed height, widest line and line height. */
  readonly height: number;
  readonly width: number;
  readonly line: number;
}

function wordFloor(longestWord: number): number {
  return longestWord * NAME_FLOOR * CAPITAL_EM;
}

/**
 * The box width that sheds `excess` more points of height from a name now `current` tall: the
 * height it must lose in all, as a share of its designed height, scales its designed line width.
 * Null when there is nothing to shed.
 */
export function nameCap(
  fit: Pick<NameFit, 'height' | 'width'>,
  current: number,
  excess: number,
  longestWord: number,
): number | null {
  if (fit.height <= 0 || fit.width <= 0) return null;
  const shed = excess + Math.max(0, fit.height - current);
  if (shed <= 1) return null;
  const cap = fit.width * Math.max(MIN_NAME_SCALE, 1 - shed / fit.height);
  // Never narrower than the longest word needs at the floor, or it would break mid-word
  // ("CHEFCHA / OUEN"); what the floor cannot shed scrolls.
  return Math.max(cap, wordFloor(longestWord));
}

/** The line height this half's name would set at on its own (its designed one when it fits). */
export function nameTarget(fit: NameFit): number | null {
  if (fit.line <= 0 || fit.width <= 0) return null;
  return fit.need === null ? fit.line : (fit.line * fit.need) / fit.width;
}

/** Both finalists get equal billing: the smaller of the two halves' own sizes, for both. */
export function sharedNameSize(targets: readonly (number | null)[]): number | null {
  const known = targets.filter((target): target is number => target !== null && target > 0);
  return known.length === targets.length && known.length > 0 ? Math.min(...known) : null;
}

/**
 * The box the name is set in at the shared size: its designed width scaled to the shared line
 * height, never narrower than the longest word needs at the floor. Null at the designed size.
 */
export function sharedNameCap(
  fit: NameFit,
  shared: number | null,
  longestWord: number,
): number | null {
  if (shared === null || fit.line <= 0 || fit.width <= 0) return fit.need;
  const cap = Math.max((fit.width * shared) / fit.line, wordFloor(longestWord));
  return cap >= fit.width - 1 ? null : cap;
}

export function useNameFit(name: string, locale: string, excess: number, shared: number | null) {
  const fitKey = `${name}|${locale}`;
  const longestWord = Math.max(0, ...name.split(/\s+/u).map((word) => [...word].length));
  // The name gives up height before anything scrolls. Its designed size is measured once (height,
  // widest line, line height); a half that runs past its share needs a box narrower by the height it
  // must shed, and the screen sets both names at the smaller of the two halves' sizes. The box is
  // always scaled from the designed measure, never from the last capped one, so the names settle.
  // No line count is forced: Android reports an ellipsised line as the whole text, so auto-fit
  // would never see the cut.
  const [measure, setMeasure] = useState({ height: 0, lineWidth: 0, line: 0 });
  const [fit, setFit] = useState<NameFit>({
    key: fitKey,
    need: null,
    height: 0,
    width: 0,
    line: 0,
  });
  const cap = sharedNameCap(fit, shared, longestWord);
  // Adjusted while rendering (not in an effect) so the smaller name lands in the same pass.
  if (fit.key !== fitKey) {
    setFit({ key: fitKey, need: null, height: 0, width: 0, line: 0 });
  } else if (
    cap === null &&
    measure.height > 0 &&
    measure.lineWidth > 0 &&
    (fit.height !== measure.height || fit.width !== measure.lineWidth || fit.line !== measure.line)
  ) {
    setFit({ ...fit, height: measure.height, width: measure.lineWidth, line: measure.line });
  } else if (fit.height > 0) {
    const need = nameCap(fit, measure.height, excess, longestWord);
    if (need !== null && (fit.need === null || Math.abs(need - fit.need) > 2))
      setFit({ ...fit, need });
  }
  return {
    cap,
    target: nameTarget(fit),
    onLayout: (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      setMeasure((m) => (m.height === height ? m : { ...m, height }));
    },
    onTextLayout: (event: TextLayoutEvent) => {
      const { lines } = event.nativeEvent;
      const lineWidth = Math.max(0, ...lines.map((line) => line.width));
      const line = lines[0]?.height ?? 0;
      setMeasure((m) =>
        m.lineWidth === lineWidth && m.line === line ? m : { ...m, lineWidth, line },
      );
    },
  };
}
