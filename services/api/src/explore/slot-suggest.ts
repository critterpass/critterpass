/**
 * ADD TO DAY's suggested slot (docs/product-decisions.md §7 place detail): the planner's slot
 * finder for one place. Over the plan's dated days, lightest day first, it tries the place's quiet
 * window (from the crowd forecast) and then every half hour of its opening hours (or 08:00–21:00
 * when hours are unknown), and takes the first start whose whole visit fits between the day's
 * timed items. Pure: the caller loads the plan, hours and crowd window.
 */
import { WEEKDAYS, localSchedule, type Hours, type TimeSpan } from '@cp/domain';

export const DEFAULT_VISIT_MIN = 90;
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const STEP = 30;

export interface SlotDay {
  readonly day_no: number;
  /** `YYYY-MM-DD`; undated days are skipped. */
  readonly date: string | null;
  /** Timed items as local minutes since midnight. */
  readonly busy: readonly { readonly start: number; readonly end: number }[];
}

export interface SlotInput {
  readonly days: readonly SlotDay[];
  readonly tz: string;
  /** Known opening hours, or null (then the day's default window applies). */
  readonly hours: Hours | null;
  /** The crowd forecast's quiet window start, local `HH:MM`, when there is one. */
  readonly quietStart: string | null;
  readonly durationMin: number;
}

export interface SuggestedSlot {
  readonly day_no: number;
  readonly date: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly reason: 'quiet_window' | 'free_gap';
}

const minutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const clock = (value: number): string =>
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function openSpans(hours: Hours | null, date: string): TimeSpan[] | null {
  if (hours === null) return null;
  const exception = hours.exceptions?.find((entry) => entry.date === date);
  if (exception !== undefined) return exception.spans;
  const weekday = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
  return weekday === undefined ? [] : (hours.weekly[weekday] ?? []);
}

function fits(start: number, day: SlotDay, spans: TimeSpan[] | null, duration: number): boolean {
  const end = start + duration;
  const open =
    spans === null
      ? start >= DAY_START && end <= DAY_END
      : spans.some((span) => start >= minutes(span.start) && end <= minutes(span.end));
  return open && day.busy.every((item) => end <= item.start || start >= item.end);
}

function candidates(spans: TimeSpan[] | null, quiet: string | null): number[] {
  const starts: number[] = quiet === null ? [] : [minutes(quiet)];
  const windows = spans ?? [{ start: clock(DAY_START), end: clock(DAY_END) }];
  for (const span of windows) {
    const from = Math.max(minutes(span.start), DAY_START);
    const first = Math.ceil(from / STEP) * STEP;
    for (let at = first; at < Math.min(minutes(span.end), DAY_END); at += STEP) starts.push(at);
  }
  return starts;
}

export function suggestSlot(input: SlotInput): SuggestedSlot | null {
  const days = input.days
    .filter((day): day is SlotDay & { date: string } => day.date !== null)
    .sort((a, b) => a.busy.length - b.busy.length || a.day_no - b.day_no);
  for (const day of days) {
    const spans = openSpans(input.hours, day.date);
    for (const start of candidates(spans, input.quietStart)) {
      if (!fits(start, day, spans, input.durationMin)) continue;
      const at = (value: number) =>
        localSchedule({ date: day.date, time: clock(value), tz: input.tz }).toISOString();
      return {
        day_no: day.day_no,
        date: day.date,
        starts_at: at(start),
        ends_at: at(start + input.durationMin),
        reason:
          input.quietStart !== null && start === minutes(input.quietStart)
            ? 'quiet_window'
            : 'free_gap',
      };
    }
  }
  return null;
}
