/**
 * One colour per trip day, the same everywhere a day shows (chips, sheet discs, map routes, the
 * draft strip, the All days grid): day 1 sun, 2 pink, 3 sky, 4 mint, 5 tangerine, then again.
 * A day has three shades: its fill (the crew accent: chips, discs, tiles), its route (a deeper
 * sun and mint so the line and its numbered pins read on the light map) and its ink (the day's
 * dark text colour, the status tint of the same hue).
 */
import { premium } from '@cp/design-tokens';

import { MAP_MARKS } from './palette';

export interface DayColours {
  readonly fill: string;
  readonly route: string;
  readonly ink: string;
}

const { accent } = premium;
const status = premium.modes.light.color.status;

const RUN: readonly DayColours[] = [
  { fill: accent.sun, route: MAP_MARKS.sunRoute, ink: status.maybe.text },
  { fill: accent.pink, route: accent.pink, ink: status.voteOpen.text },
  { fill: accent.sky, route: accent.sky, ink: status.rain.text },
  { fill: accent.mint, route: MAP_MARKS.mintRoute, ink: status.booked.text },
  { fill: accent.tangerine, route: accent.tangerine, ink: status.tangerine.text },
];

export function dayColours(dayNo: number): DayColours {
  const index = (Math.max(1, Math.trunc(dayNo)) - 1) % RUN.length;
  return RUN[index] ?? (RUN[0] as DayColours);
}

/** A day with nothing on it yet (the draft strip's grey tile). */
export const EMPTY_DAY = {
  fill: premium.modes.light.color.control,
  ink: premium.modes.light.color.placeholder,
} as const;
