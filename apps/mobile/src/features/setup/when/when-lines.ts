/**
 * The dates step's line under its title: how many calendars are in, and who is still to come; or,
 * for a trip of one, whether your own days are in.
 */
import { plural, t } from '@lingui/core/macro';

import { countWord, monthName, sentenceStart } from './copy';
import type { WhenModel } from './when-view';

export function syncedLine(model: WhenModel): string {
  const calendars = model.synced;
  const synced = countWord(calendars);
  const missing = model.total - model.synced;
  // The phone's calendar is already in (or on its way) while its counts have not come back yet:
  // saying "your days aren't in" beside "your calendar is in" would contradict the row below.
  const reading =
    model.synced === 0 &&
    (model.calendar.status === 'synced' || model.calendar.status === 'syncing');
  if (reading) {
    return t({ id: 'setup.when.line.reading', message: 'Reading your calendar…' });
  }
  if (model.solo) {
    if (model.mode === 'pick') {
      return t({
        id: 'setup.when.line.pickSolo',
        message: 'Your calendar looks open. Pick the days you want.',
      });
    }
    return model.synced === 0
      ? t({
          id: 'setup.when.line.noneSolo',
          message: 'Your days aren’t in yet. Pick the dates, or connect a calendar first.',
        })
      : t({ id: 'setup.when.line.solo', message: 'From your calendar.' });
  }
  if (model.synced === 0) {
    return t({
      id: 'setup.when.line.none',
      message: 'Nobody has shared their days yet. Pick the dates, or connect a calendar first.',
    });
  }
  if (missing <= 0) {
    return t({
      id: 'setup.when.line.all',
      message: plural(calendars, {
        one: `From ${synced} synced calendar. Everyone’s in.`,
        other: `From ${synced} synced calendars. Everyone’s in.`,
      }),
    });
  }
  const only =
    model.unsyncedNames.length === 1 && missing === 1 ? model.unsyncedNames[0] : undefined;
  if (only !== undefined) {
    return t({
      id: 'setup.when.line.oneMissing',
      message: plural(calendars, {
        one: `From ${synced} synced calendar. ${only} hasn’t connected yet.`,
        other: `From ${synced} synced calendars. ${only} hasn’t connected yet.`,
      }),
    });
  }
  const left = sentenceStart(countWord(missing));
  return t({
    id: 'setup.when.line.some',
    message: plural(calendars, {
      one: `From ${synced} synced calendar. ${left} still to come.`,
      other: `From ${synced} synced calendars. ${left} still to come.`,
    }),
  });
}

export function checkedLine(model: WhenModel, locale: string): string {
  const last = model.months.at(-1)?.days.at(-1)?.date;
  const calendars = model.synced;
  const count = sentenceStart(countWord(calendars));
  const until = last === undefined ? '' : monthName(locale, last);
  return t({
    id: 'setup.when.line.checked',
    message: plural(calendars, {
      one: `${count} calendar, checked through ${until}. Nobody's week is perfect.`,
      other: `${count} calendars, checked through ${until}. Nobody's week is perfect.`,
    }),
  });
}
