/**
 * The briefing's words both hubs share: a line's chip label ("Nudge", "Set ✓") and the guide's own
 * line when today's briefing has nothing in it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import type { BriefingLine, NextBriefing } from './briefing-model';

export function briefingChipLabel(line: BriefingLine): string {
  switch (line.action) {
    case 'done':
      return t({ id: 'trip.briefing.done', message: 'Done' });
    case 'nudge':
      return line.status === 'nudged'
        ? t({ id: 'trip.briefing.sent', message: 'Sent' })
        : t({ id: 'trip.briefing.nudge', message: 'Nudge' });
    case 'set':
      return line.status === 'set'
        ? t({ id: 'trip.briefing.setDone', message: 'Set ✓' })
        : t({ id: 'trip.briefing.set', message: 'Set' });
    case 'open':
      return t({ id: 'trip.briefing.open', message: 'Open' });
  }
}

/** A briefing date as "Oct 11". */
export function briefingDate(locale: string, date: string): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The guide's own line when today's briefing has nothing in it, with when the next one comes. It
 * speaks for the briefing only ("nothing new from me"): the plan's check may still have something
 * to fix, and says so on the plan.
 */
export function useNothingToday(next: NextBriefing): string {
  const locale = useLocale();
  const { t } = useLingui();
  if (next === null) {
    return t({ id: 'trip.briefing.empty', message: 'Nothing new from me today. Enjoy it.' });
  }
  if (next.on === 'today') {
    return t({
      id: 'trip.briefing.noneYet',
      message: 'Nothing from me yet. Today’s briefing comes this morning.',
    });
  }
  if (next.on === 'tomorrow') {
    return t({
      id: 'trip.briefing.noneTomorrow',
      message: 'Nothing new from me today. I’ll check again tomorrow morning.',
    });
  }
  const start = briefingDate(locale, next.date);
  return t({
    id: 'trip.briefing.noneFrom',
    message: `Nothing from me yet. My morning briefings start ${start}.`,
  });
}
