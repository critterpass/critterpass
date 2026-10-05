/**
 * The one line under a new time or day on a stop's sheet, before SAVE: what else the change moves
 * ("3 later stops move by 1 h"), or what it runs into and so can't be saved as it is.
 */
import { plural, t } from '@lingui/core/macro';

import type { Retime } from '../day-plan/reschedule';
import type { GapClose } from './close-gap';
import { clock } from './format';
import type { ChangePreview } from './item-detail-sheet';

/** "45 min", "1 h", "1 h 30". */
export function durationText(minutes: number): string {
  const hours = String(Math.floor(minutes / 60));
  const rest = String(minutes % 60).padStart(2, '0');
  const only = String(minutes);
  if (minutes < 60) return t({ id: 'plan.retime.minutes', message: `${only} min` });
  return minutes % 60 === 0
    ? t({ id: 'plan.retime.hours', message: `${hours} h` })
    : t({ id: 'plan.retime.hoursMinutes', message: `${hours} h ${rest}` });
}

export function retimePreview(
  result: Retime,
  locale: string,
  /** The day the stop moves to, when it changes day ("Wed, Oct 21"). */
  toDay: string | null,
): ChangePreview {
  if (!result.ok) {
    const { refusal } = result;
    if (refusal.kind === 'starts_too_early') {
      const stop = refusal.stop.title;
      const until = clock(locale, refusal.stop.end ?? 0);
      const earliest = clock(locale, refusal.earliest);
      return {
        blocked: true,
        useStart: refusal.earliest,
        line: t({
          id: 'plan.retime.tooEarly',
          message: `${stop} runs until ${until}. Start at ${earliest} or later.`,
        }),
      };
    }
    if (refusal.kind === 'runs_into') {
      const stop = refusal.stop.title;
      return {
        blocked: true,
        line:
          refusal.stop.lock === 'booking'
            ? t({
                id: 'plan.retime.runsIntoBooked',
                message: `That runs into ${stop}, which is booked and keeps its time.`,
              })
            : t({
                id: 'plan.retime.runsIntoMustDo',
                message: `That runs into ${stop}, a must-do that keeps its time.`,
              }),
      };
    }
    return {
      blocked: true,
      line: t({ id: 'plan.retime.tooLate', message: 'That pushes the day past midnight.' }),
    };
  }
  const { pushed, pushedBy } = result;
  if (pushed === 0) {
    return {
      blocked: false,
      line:
        toDay === null
          ? t({ id: 'plan.retime.nothingMoves', message: 'Nothing else moves.' })
          : t({ id: 'plan.retime.fitsDay', message: `Fits ${toDay}. Nothing there moves.` }),
    };
  }
  const by = pushedBy === null ? null : durationText(pushedBy);
  const count =
    by === null
      ? t({
          id: 'plan.retime.pushed',
          message: plural(pushed, {
            one: '# later stop moves later too',
            other: '# later stops move later too',
          }),
        })
      : t({
          id: 'plan.retime.pushedBy',
          message: plural(pushed, {
            one: `# later stop moves by ${by}`,
            other: `# later stops move by ${by}`,
          }),
        });
  // Where the push ends up, not only how many: a day pushed into the night says so.
  const last = result.last;
  const stop = last?.stop.title ?? '';
  const at = last === null ? '' : clock(locale, last.start);
  return {
    blocked: false,
    line:
      last === null || pushed < 2
        ? count
        : t({
            id: 'plan.retime.lastAt',
            message: `${count}. ${stop} would start at ${at}.`,
          }),
  };
}

/**
 * "3 later stops move 1 h 25 earlier." when taking a stop off its day lets the stops after it go
 * back to the time of day they are for; with `day`, said of that day ("On Tue 20 Oct, …"). Null
 * when nothing moves.
 */
export function gapLine(gap: GapClose, day?: string): string | null {
  const { moved, movedBy } = gap;
  if (moved === 0) return null;
  const by = movedBy === null ? null : durationText(movedBy);
  const line =
    by === null
      ? t({
          id: 'plan.retime.backEarlier',
          message: plural(moved, {
            one: '# later stop moves earlier.',
            other: '# later stops move earlier.',
          }),
        })
      : t({
          id: 'plan.retime.backEarlierBy',
          message: plural(moved, {
            one: `# later stop moves ${by} earlier.`,
            other: `# later stops move ${by} earlier.`,
          }),
        });
  return day === undefined ? line : t({ id: 'plan.retime.onDay', message: `On ${day}: ${line}` });
}
