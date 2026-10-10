/**
 * One colour per trip day, the same everywhere a day shows (chips, sheet discs, map routes, the
 * draft strip, the All days grid): day 1 sun, 2 pink, 3 sky, 4 mint, 5 tangerine, then again.
 * A day has three shades: its fill (chips, discs, tiles), its route (a deeper sun and mint so the
 * line and its numbered pins read on the light map) and its ink (the day's dark text colour).
 */
export interface DayColours {
  readonly fill: string;
  readonly route: string;
  readonly ink: string;
}

const RUN: readonly DayColours[] = [
  { fill: '#ffd84a', route: '#e0a800', ink: '#8a6a0c' },
  { fill: '#ff5fa8', route: '#ff5fa8', ink: '#b0306b' },
  { fill: '#4f86ff', route: '#4f86ff', ink: '#2f5fc4' },
  { fill: '#54d6a4', route: '#2fb886', ink: '#1f7a55' },
  { fill: '#ff9a4d', route: '#ff9a4d', ink: '#a8501a' },
];

export function dayColours(dayNo: number): DayColours {
  const index = (Math.max(1, Math.trunc(dayNo)) - 1) % RUN.length;
  return RUN[index] ?? (RUN[0] as DayColours);
}

/** A day with nothing on it yet (the draft strip's grey tile). */
export const EMPTY_DAY = { fill: '#f1f1f4', ink: '#9a9daa' } as const;
