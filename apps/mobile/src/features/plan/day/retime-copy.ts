/**
 * The one line under a new time or day on a stop's sheet, before SAVE: what else the change moves
 * ("3 later stops move by 1 h"), or what it runs into and so can't be saved as it is.
 */
import { plural, t } from '@lingui/core/macro';

import type { Retime } from '../day-plan/reschedule';
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
  return {
    blocked: false,
    line:
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
          }),
  };
}
