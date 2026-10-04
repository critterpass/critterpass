/**
 * The plan check screen's own words (7h-1): the headline, the line under it, FIX ALL, the toasts
 * after a FIX or a keep, and the undesigned states (running, failed, nothing to fix, an issue the
 * plan moved past, a move the real drive does not leave room for).
 */
import { plural, t } from '@lingui/core/macro';

export function checkTitle(fix: number, know: number): string {
  const first =
    fix === 0
      ? t({ id: 'plan.check.title.noFix', message: 'NOTHING TO FIX' })
      : t({
          id: 'plan.check.title.fix',
          message: plural(fix, { one: '# TO FIX', other: '# TO FIX' }),
        });
  if (know === 0) return first;
  const second = t({
    id: 'plan.check.title.know',
    message: plural(know, { one: '# TO KNOW', other: '# TO KNOW' }),
  });
  return t({ id: 'plan.check.title.both', message: `${first},\n${second}` });
}

export function checkBody(days: number): string {
  return t({
    id: 'plan.check.body',
    message: plural(days, {
      one: 'Opening hours, drives, bookings and everyone’s saves, against the day. Nothing changes until you say so.',
      other:
        'Opening hours, drives, bookings and everyone’s saves, against all # days. Nothing changes until you say so.',
    }),
  });
}

export function checkingTitle(): string {
  return t({ id: 'plan.check.title.checking', message: 'CHECKING\nTHE PLAN' });
}

export function checkingLabel(): string {
  return t({ id: 'plan.check.checking', message: 'CHECKING…' });
}

export function backTripLabel(): string {
  return t({ id: 'plan.check.backTrip', message: 'Trip' });
}

export function fixAllLabel(count: number): string {
  return t({
    id: 'plan.check.fixAll',
    message: plural(count, { one: 'FIX # · REVIEW FIRST', other: 'FIX ALL # · REVIEW FIRST' }),
  });
}

export function balanceRowLabel(): string {
  return t({ id: 'plan.check.balanceRow', message: 'Whose picks made it' });
}

export function failedNotice(): string {
  return t({
    id: 'plan.check.failed',
    message: 'The check didn’t finish this time. It runs again after the next change.',
  });
}

export function clearNotice(): string {
  return t({
    id: 'plan.check.clear',
    message:
      'All good. Hours, drives and bookings line up. Tokek checks again whenever the plan changes.',
  });
}

export function runningNotice(): string {
  return t({
    id: 'plan.check.running',
    message: 'Tokek is checking the plan. It takes a moment after each change.',
  });
}

export function appliedToast(done: string): { title: string; subtitle: string } {
  return {
    title: done,
    subtitle: t({ id: 'plan.check.toast.undo', message: 'Undo it from the trip feed.' }),
  };
}

export function sentToast(): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.check.toast.sent', message: 'Sent to the crew' }),
    subtitle: t({ id: 'plan.check.toast.sentLine', message: 'It changes once they say yes.' }),
  };
}

export function staleToast(): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.check.toast.stale', message: 'The plan changed since this check' }),
    subtitle: t({ id: 'plan.check.toast.staleLine', message: 'Tokek is checking it again.' }),
  };
}

export function failedToast(): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.check.toast.failed', message: 'That didn’t go through' }),
    subtitle: t({
      id: 'plan.check.toast.failedLine',
      message: 'Nothing changed. Try again in a moment.',
    }),
  };
}

export function unfitToast(): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.check.toast.unfit', message: 'That move doesn’t fit after all' }),
    subtitle: t({
      id: 'plan.check.toast.unfitLine',
      message: 'The drive is longer than the time it leaves. Nothing changed.',
    }),
  };
}

export function keptToast(): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.check.toast.kept', message: 'Kept as it is' }),
    subtitle: t({
      id: 'plan.check.toast.keptLine',
      message: 'Tokek won’t bring it up again unless the stops around it change.',
    }),
  };
}

export function movedLine(place: string, time: string): string {
  return t({ id: 'plan.check.done.moved', message: `${place} moved to ${time}.` });
}

export function swappedLine(from: string, to: string): string {
  return t({ id: 'plan.check.done.swapped', message: `${from} is now ${to}.` });
}

export function nearerDetail(
  name: string,
  legIn: number | null,
  saved: string,
  leg: string,
): string {
  return legIn === null
    ? t({ id: 'plan.check.nearer.plain', message: `${name} instead: ${saved} less in the car.` })
    : t({
        id: 'plan.check.nearer.detail',
        message: `${name} instead, ${leg} from the stop before: ${saved} less in the car.`,
      });
}

export function nearerNone(): string {
  return t({
    id: 'plan.check.nearer.none',
    message:
      'Nothing of the same kind is nearer and open then. Moving a stop to another day may help.',
  });
}

export function nearerUseLabel(): string {
  return t({ id: 'plan.check.nearer.use', message: 'Use it' });
}
