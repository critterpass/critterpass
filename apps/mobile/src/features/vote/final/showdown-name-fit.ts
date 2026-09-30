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
/** Display line height as a share of the font size (the mega display token), with room to spare. */
const NAME_LINE_EM = 0.8;
const FLOOR_WIDTH_MARGIN = 1.15;

export interface NameFit {
  readonly key: string;
  /** The fixed width the name is set in, or null at its designed size. */
  readonly cap: number | null;
  /** The name's designed height, widest line and line count. */
  readonly height: number;
  readonly width: number;
  readonly lines: number;
}

/**
 * The box width that sheds `excess` more points of height from a name now `current` tall: the
 * height it must lose in all, as a share of its designed height, scales its designed line width.
 * Null when there is nothing to shed.
 */
export function nameCap(fit: NameFit, current: number, excess: number): number | null {
  if (fit.height <= 0 || fit.width <= 0) return null;
  const shed = excess + Math.max(0, fit.height - current);
  if (shed <= 1) return null;
  const cap = fit.width * Math.max(MIN_NAME_SCALE, 1 - shed / fit.height);
  // Never narrower than the widest line needs at the floor, or a long word would break mid-word
  // ("CHEFCHA / OUEN"); what the floor cannot shed scrolls.
  const designedSize = fit.height / Math.max(1, fit.lines) / NAME_LINE_EM;
  const atFloor = fit.width * (NAME_FLOOR / designedSize) * FLOOR_WIDTH_MARGIN;
  return Math.min(fit.width, Math.max(cap, atFloor));
}

export function useNameFit(fitKey: string, excess: number) {
  // The name gives up height before anything scrolls. Its designed size is measured once (the
  // height and the widest line it sets); a half that runs past its share then gives the name a
  // fixed box narrower by the height it must shed, and auto-fit sets it smaller to fit that box.
  // The box is always scaled from the designed measure, never from the last capped one, so the
  // name settles at one size. No line count is forced: Android reports an ellipsised line as the
  // whole text, so auto-fit would never see the cut. Content that already fits keeps the name as
  // designed.
  const [measure, setMeasure] = useState({ height: 0, lineWidth: 0, lines: 0 });
  const [fit, setFit] = useState<NameFit>({
    key: fitKey,
    cap: null,
    height: 0,
    width: 0,
    lines: 0,
  });
  // Adjusted while rendering (not in an effect) so the smaller name lands in the same pass.
  if (fit.key !== fitKey) {
    setFit({ key: fitKey, cap: null, height: 0, width: 0, lines: 0 });
  } else if (fit.cap === null && measure.height > 0 && measure.lineWidth > 0) {
    if (
      fit.height !== measure.height ||
      fit.width !== measure.lineWidth ||
      fit.lines !== measure.lines
    )
      setFit({ ...fit, height: measure.height, width: measure.lineWidth, lines: measure.lines });
    else {
      const cap = nameCap(fit, measure.height, excess);
      if (cap !== null) setFit({ ...fit, cap });
    }
  } else if (fit.cap !== null) {
    const cap = nameCap(fit, measure.height, excess);
    if (cap !== null && Math.abs(cap - fit.cap) > 2) setFit({ ...fit, cap });
  }
  return {
    cap: fit.cap,
    onLayout: (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      setMeasure((m) => (m.height === height ? m : { ...m, height }));
    },
    onTextLayout: (event: TextLayoutEvent) => {
      const { lines } = event.nativeEvent;
      const lineWidth = Math.max(0, ...lines.map((line) => line.width));
      setMeasure((m) =>
        m.lineWidth === lineWidth && m.lines === lines.length
          ? m
          : { ...m, lineWidth, lines: lines.length },
      );
    },
  };
}
