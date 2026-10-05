/**
 * The place page's words and choices, from plain values (7e-1): the CTA that always says where the
 * place would go ("ADD TO SAT · 08:00", "IN DAY 3 · 08:00"), the when-it-fits title and its
 * two-clause sentence worded from the fit's reason codes, and the hour bars. Every line is worded
 * here through `t`, so the server sends codes and numbers, never copy.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes, grades and Intl options, never copy. */
import { toLocalWallTime, type FitReason } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { HourLevel } from '@/ui/planning';

import type { FitBars, FitDayView, PlaceDetailContext } from './context';

/** "Sat" for a local date, in the reader's language. */
export function weekdayOf(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** "Sat 17": the weekday and the day of the month. */
export function dayTitle(date: string, locale: string): string {
  return `${weekdayOf(date, locale)} ${Number(date.slice(8, 10))}`;
}

export type DetailCta =
  | { readonly kind: 'loading' }
  | { readonly kind: 'offline' }
  /** No plan she can see yet (a member before it is shared): nothing to tap but the guide. */
  | { readonly kind: 'noPlan' }
  /** No slot is suggested: the button opens Add to plan for her to choose the day. */
  | { readonly kind: 'noFit' }
  | { readonly kind: 'inPlan'; readonly dayNo: number; readonly time: string | null }
  | {
      readonly kind: 'add';
      readonly mode: 'apply' | 'changeset';
      readonly day: FitDayView;
      readonly label: string;
    };

export interface CtaInput {
  readonly context: PlaceDetailContext | null;
  readonly status: 'loading' | 'ready' | 'offline';
  readonly tz: string;
  readonly locale: string;
}

/** What the page's main button does and says; the label always names the day and the time. */
export function detailCta(input: CtaInput): DetailCta {
  const { context } = input;
  if (context === null) return { kind: input.status === 'offline' ? 'offline' : 'loading' };
  if (context.in_plan !== null) {
    const at = context.in_plan.starts_at;
    return {
      kind: 'inPlan',
      dayNo: context.in_plan.day_no,
      time: at === null ? null : toLocalWallTime(new Date(at), input.tz).time.slice(0, 5),
    };
  }
  // The plan she sees: the crew's, or her own draft before there is one.
  if (context.planVersion === null) return { kind: 'noPlan' };
  const best = context.fits?.best ?? null;
  if (best === null) return { kind: 'noFit' };
  const weekday = weekdayOf(best.date, input.locale);
  const time = best.start;
  return {
    kind: 'add',
    mode: context.add_mode,
    day: best,
    label:
      context.add_mode === 'apply'
        ? t({ id: 'explore.detail.addTo', message: `Add to ${weekday} · ${time}` })
        : t({ id: 'explore.detail.suggestFor', message: `Suggest for ${weekday} · ${time}` }),
  };
}

export function ctaLabel(cta: DetailCta): string {
  switch (cta.kind) {
    case 'add':
      return cta.label;
    case 'inPlan': {
      const day = String(cta.dayNo);
      const time = cta.time;
      return time === null
        ? t({ id: 'explore.detail.inDay', message: `In day ${day}` })
        : t({ id: 'explore.detail.inDayAt', message: `In day ${day} · ${time}` });
    }
    case 'noFit':
      return t({ id: 'explore.detail.chooseDay', message: 'Choose a day' });
    case 'noPlan':
      return t({ id: 'explore.detail.noPlan', message: 'The plan isn’t shared yet' });
    case 'offline':
      return t({ id: 'explore.detail.offline', message: 'Adding needs a connection' });
    case 'loading':
      return t({ id: 'explore.detail.loading', message: 'Finding when it fits' });
  }
}

/** "10" on the hour, "10:30" otherwise: how the guide says a time in a sentence. */
function spoken(time: string): string {
  return time.endsWith(':00') ? String(Number(time.slice(0, 2))) : time;
}

function find<C extends FitReason['code']>(reasons: readonly FitReason[], code: C) {
  return reasons.find((r): r is Extract<FitReason, { code: C }> => r.code === code);
}

/** One clause for the strongest reasons of a day, best first. */
function clauses(reasons: readonly FitReason[], stopName: (id: string) => string | null) {
  const out: string[] = [];
  if (find(reasons, 'free_day') !== undefined) {
    out.push(t({ id: 'explore.detail.why.freeDay', message: 'Your free day' }));
  }
  const busy = find(reasons, 'busy_from');
  if (busy !== undefined) {
    const at = spoken(busy.params.time);
    out.push(
      busy.params.source === 'visits'
        ? t({ id: 'explore.detail.why.busySeen', message: `crews have seen it busy from ${at}` })
        : t({ id: 'explore.detail.why.busy', message: `it usually gets busy around ${at}` }),
    );
  }
  const quiet = find(reasons, 'quiet_until');
  if (quiet !== undefined && busy === undefined) {
    const at = spoken(quiet.params.time);
    out.push(t({ id: 'explore.detail.why.quiet', message: `it's quiet until ${at}` }));
  }
  const after = find(reasons, 'after_item');
  const afterName = after === undefined ? null : stopName(after.params.stable_id);
  if (afterName !== null) {
    out.push(t({ id: 'explore.detail.why.after', message: `right after ${afterName}` }));
  }
  const rain = find(reasons, 'rain_likely');
  if (rain !== undefined) {
    const [from, to] = [spoken(rain.params.from), spoken(rain.params.to)];
    out.push(t({ id: 'explore.detail.why.rain', message: `rain is likely ${from}–${to}` }));
  }
  if (find(reasons, 'hours_unknown') !== undefined) {
    out.push(t({ id: 'explore.detail.why.hoursUnknown', message: "its hours aren't known" }));
  }
  return out;
}

const capital = (text: string, locale: string): string =>
  text.length === 0 ? text : text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

/**
 * "Your free day, and the tour buses get there around 10. Thursday after the springs works too."
 * The best day's two strongest reasons, then the next best day; null when there is nothing to say.
 */
export function fitSentence(
  fits: PlaceDetailContext['fits'],
  input: { readonly locale: string; readonly stopName: (id: string) => string | null },
): string | null {
  const best = fits?.best ?? null;
  if (best === null) return null;
  const said = clauses(best.reasons, input.stopName).slice(0, 2);
  const first =
    said.length === 0
      ? null
      : said.length === 1
        ? `${capital(said[0] ?? '', input.locale)}.`
        : t({
            id: 'explore.detail.why.two',
            message: `${capital(said[0] ?? '', input.locale)}, and ${said[1] ?? ''}.`,
          });
  const other = fits?.otherBest ?? null;
  const otherAfter = other === null ? undefined : find(other.reasons, 'after_item');
  const afterName = otherAfter === undefined ? null : input.stopName(otherAfter.params.stable_id);
  const weekday =
    other === null
      ? null
      : new Intl.DateTimeFormat(input.locale, { weekday: 'long', timeZone: 'UTC' }).format(
          new Date(`${other.date}T12:00:00Z`),
        );
  const second =
    weekday === null
      ? null
      : afterName === null
        ? t({ id: 'explore.detail.why.also', message: `${weekday} works too.` })
        : t({
            id: 'explore.detail.why.alsoAfter',
            message: `${weekday} after ${afterName} works too.`,
          });
  const sentence = [first, second].filter((part): part is string => part !== null).join(' ');
  return sentence === '' ? null : sentence;
}

/** The bars over the open span: the curve's levels, or a flat span when no curve is known. */
export function hourLevels(bars: FitBars): HourLevel[] {
  const flat = 0.3;
  const closing = 0.15;
  // One bar per open hour, then the closing hour as a low bar, so the axis ends on it (08 … 17).
  return Array.from({ length: Math.max(0, bars.to - bars.from + 1) }, (_, index) => ({
    hour: bars.from + index,
    level:
      bars.from + index === bars.to
        ? closing
        : bars.hourly === null
          ? flat
          : Math.min(1, (bars.hourly[index] ?? 0) / 100),
  }));
}

/** "Quiet until 10, busiest at 12" for screen readers; the open hours without a curve. */
export function barsLabel(bars: FitBars): string {
  const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
  if (bars.hourly === null) {
    const [from, to] = [hh(bars.from), hh(bars.to)];
    return t({ id: 'explore.detail.bars.open', message: `Open ${from} to ${to}` });
  }
  const levels = bars.hourly;
  const peak = levels.reduce((top, level, index) => (level > (levels[top] ?? 0) ? index : top), 0);
  const firstBusy = levels.findIndex((level) => level >= 70);
  const busiest = hh(bars.from + peak);
  if (firstBusy <= 0) {
    return t({ id: 'explore.detail.bars.peak', message: `Busiest at ${busiest}` });
  }
  const quiet = hh(bars.from + firstBusy);
  return t({
    id: 'explore.detail.bars.quiet',
    message: `Quiet until ${quiet}, busiest at ${busiest}`,
  });
}

/** A duration as the design writes it: "45 min" under an hour, then "2h" or "1h30". */
export function durationText(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) {
    const n = String(whole);
    return t({ id: 'explore.detail.minutes', message: `${n} min` });
  }
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h${String(rest).padStart(2, '0')}`;
}

/** "45 min from the villa", "2h20 from Villa Sayan". */
export function fromStayLabel(minutes: number, stayName: string): string {
  const duration = durationText(minutes);
  return t({ id: 'explore.detail.fromStay', message: `${duration} from ${stayName}` });
}

/** "Saved by Alex + Rin". */
export function savedByLabel(firstNames: readonly string[]): string {
  const names = firstNames.join(' + ');
  return t({ id: 'explore.detail.savedBy', message: `Saved by ${names}` });
}

/** "Crew split 2–2". */
export function splitCountLabel(want: number, ratherNot: number): string {
  const [w, r] = [String(want), String(ratherNot)];
  return t({ id: 'explore.detail.split', message: `Crew split ${w}–${r}` });
}
