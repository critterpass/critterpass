/**
 * React Native parses only `linear-gradient` and `radial-gradient` (both platforms): a
 * `repeating-linear-gradient` paper grain or stripe draws nothing at all. This writes the same
 * pattern as a plain linear gradient whose hard stops repeat every `period` px along `length` px,
 * which is what the repeating form means.
 */
export interface RepeatingBand {
  readonly color: string;
  /** The band's width in px; the bands follow each other and fill one period. */
  readonly width: number;
}

/**
 * `linear-gradient(angle, a 0px, a 3px, b 3px, b 6px, a 6px…)` repeating `bands` until `length`
 * px are covered (the longest side the painted view can have along the angle).
 */
export function repeatingLinearGradient(
  angle: number,
  bands: readonly RepeatingBand[],
  length: number,
): string {
  return repeated('linear', `${String(angle)}deg`, bands, length);
}

/** The same for `repeating-radial-gradient(<shape> at <position>, …)`: rings out to `length`. */
export function repeatingRadialGradient(
  shape: string,
  bands: readonly RepeatingBand[],
  length: number,
): string {
  return repeated('radial', shape, bands, length);
}

function repeated(
  kind: 'linear' | 'radial',
  head: string,
  bands: readonly RepeatingBand[],
  length: number,
): string {
  const period = bands.reduce((sum, band) => sum + band.width, 0);
  if (period <= 0 || bands.length === 0) return 'none';
  const stops: string[] = [];
  for (let start = 0; start < length; start += period) {
    let at = start;
    for (const band of bands) {
      stops.push(`${band.color} ${String(at)}px`, `${band.color} ${String(at + band.width)}px`);
      at += band.width;
    }
  }
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never copy
  return `${kind}-gradient(${head}, ${stops.join(', ')})`;
}

/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- the design's pattern colours, never copy. */
const GRAIN_INK = 'rgba(23,20,42,0.035)';

/** The design's paper grain: a 1 px ink line every 6 px at 115°, over a card up to `length` px. */
export function paperGrain(length = 420): string {
  return repeatingLinearGradient(
    115,
    [
      { color: GRAIN_INK, width: 1 },
      { color: 'transparent', width: 5 },
    ],
    length,
  );
}

/** The passport's guilloche: fine rings from below the card's left. */
export const GUILLOCHE = repeatingRadialGradient(
  'circle at 20% 120%',
  [
    { color: 'rgba(23,20,42,0.04)', width: 1 },
    { color: 'transparent', width: 6 },
  ],
  700,
);

/** The boost card's pink-and-white candy strip. */
export const BOOST_STRIPE = repeatingLinearGradient(
  90,
  [
    { color: '#ff5fa8', width: 10 },
    { color: '#ffffff', width: 4 },
  ],
  420,
);

/** A paused month's gold hatching. */
export const PAUSE_HATCH = repeatingLinearGradient(
  135,
  [
    { color: 'rgba(138,106,12,0.18)', width: 3 },
    { color: 'transparent', width: 3 },
  ],
  120,
);
/* eslint-enable critterpass/no-literal-style, lingui/no-unlocalized-strings */
