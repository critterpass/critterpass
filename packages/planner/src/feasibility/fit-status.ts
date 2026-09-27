/**
 * Must-do fit. Before a draft exists, a must-do is checked against the trip's dates, the
 * place's hours and the fixed skeleton (arrival, departure, bookings) — never against days, so no
 * day number exists to leak. After a draft, the must-do's own item decides, and members only ever
 * see fits / tight / clash; the day stays with the organiser's draft.
 */
import { type Hours, type TimeSpan, WEEKDAYS } from '@cp/domain';

import { type FeasibilityResult } from './check';
import { type FitStatus } from './types';

export interface LocalWindow {
  readonly startMin: number;
  readonly endMin: number;
}

export interface PreDraftFitInput {
  /** `null` = hours unknown: the fit is `unknown`, not a guess. */
  readonly hours: Hours | null;
  readonly durationMin: number;
  /** The trip's local calendar dates (`YYYY-MM-DD`). */
  readonly dates: readonly string[];
  /** Fixed skeleton per local date: arrival, departure, booked items. */
  readonly busy?: Readonly<Record<string, readonly LocalWindow[]>>;
  /** Waking window a must-do may be placed in (08:00–22:00). */
  readonly dayWindow?: LocalWindow;
  readonly tightSlackMin?: number;
}

const DEFAULT_DAY_WINDOW: LocalWindow = { startMin: 8 * 60, endMin: 22 * 60 };

function toMin(time: string): number {
  if (time === '24:00') return 1440;
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function spansFor(hours: Hours, date: string): readonly TimeSpan[] {
  const exception = hours.exceptions?.find((e) => e.date === date);
  if (exception) return exception.spans;
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const isoDow = (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
  return hours.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? [];
}

/** Longest free stretch on `date` where the place is open, inside the waking window. */
function longestFree(input: PreDraftFitInput, date: string, window: LocalWindow): number {
  const busy = [...(input.busy?.[date] ?? [])].sort((a, b) => a.startMin - b.startMin);
  let best = 0;
  for (const span of spansFor(input.hours as Hours, date)) {
    const start = Math.max(toMin(span.start), window.startMin);
    const rawEnd = toMin(span.end);
    const end = Math.min(rawEnd <= toMin(span.start) ? 1440 : rawEnd, window.endMin);
    let cursor = start;
    for (const block of busy) {
      if (block.endMin <= cursor || block.startMin >= end) continue;
      best = Math.max(best, Math.min(block.startMin, end) - cursor);
      cursor = Math.max(cursor, block.endMin);
    }
    best = Math.max(best, end - cursor);
  }
  return best;
}

export function preDraftFit(input: PreDraftFitInput): FitStatus {
  if (!input.hours || input.dates.length === 0) return 'unknown';
  const window = input.dayWindow ?? DEFAULT_DAY_WINDOW;
  const slack = input.tightSlackMin ?? 15;
  const free = input.dates.map((date) => longestFree(input, date, window));
  const fitting = free.filter((minutes) => minutes >= input.durationMin);
  if (fitting.length === 0) return 'clash';
  const roomy = fitting.filter((minutes) => minutes - input.durationMin >= slack);
  return roomy.length >= 2 || (roomy.length === 1 && input.dates.length === 1) ? 'fits' : 'tight';
}

export interface PostDraftFit {
  readonly status: Exclude<FitStatus, 'unknown'>;
  /** The draft day holding the must-do; organiser-only. */
  readonly dayNo: number | null;
}

/** A must-do's fit in a draft: missing or violated → clash, thin slack → tight, else fits. */
export function postDraftFit(
  mustDoId: string,
  result: FeasibilityResult,
  items: readonly {
    readonly stableId: string;
    readonly mustDoId?: string | null;
    readonly dayNo?: number;
  }[],
): PostDraftFit {
  const item = items.find((i) => i.mustDoId === mustDoId);
  if (!item) return { status: 'clash', dayNo: null };
  const dayNo = item.dayNo ?? null;
  const hard = result.violations.some(
    (v) =>
      (v.stableId === item.stableId || v.relatedId === item.stableId) && v.code !== 'CHRONOTYPE',
  );
  if (hard) return { status: 'clash', dayNo };
  return { status: result.tight.includes(item.stableId) ? 'tight' : 'fits', dayNo };
}

/** What a viewer may see of a fit: members get the status only, the organiser the day too. */
export function fitForViewer(
  fit: PostDraftFit,
  viewer: 'organiser' | 'member',
): { readonly status: FitStatus; readonly dayNo?: number } {
  if (viewer === 'member' || fit.dayNo === null) return { status: fit.status };
  return { status: fit.status, dayNo: fit.dayNo };
}
