/**
 * The must-dos step's words: the pill on each row and the guide's summary line under the list.
 * Lottery copy only ever says what is true: each person enters on the official site and the guide
 * reminds them; the app never enters anyone.
 */
import { plural, t } from '@lingui/core/macro';

import { format } from '@cp/i18n';

import type { FitPill, MustDoItem } from './model';

/** "Apr 9" for a `YYYY-MM-DD` date, in the reader's language. */
export function shortDate(locale: string, date: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl options, never copy.
  return format.date(locale, new Date(`${date}T00:00:00Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function pillLabel(pill: FitPill, locale: string): string {
  switch (pill.kind) {
    case 'fits': {
      const day = pill.day;
      return day === null
        ? t({ id: 'setup.mustDos.pill.fits', message: 'Fits' })
        : t({ id: 'setup.mustDos.pill.fitsDay', message: `Fits day ${day}` });
    }
    case 'tight':
      return t({ id: 'setup.mustDos.pill.tight', message: 'Tight' });
    case 'clash':
      return t({ id: 'setup.mustDos.pill.clash', message: 'Clash' });
    case 'book_ahead':
      return t({ id: 'setup.mustDos.pill.bookAhead', message: 'Book ahead' });
    case 'lottery': {
      if (pill.closes === null) return t({ id: 'setup.mustDos.pill.lottery', message: 'Lottery' });
      const date = shortDate(locale, pill.closes);
      return t({ id: 'setup.mustDos.pill.entriesClose', message: `Entries close ${date}` });
    }
  }
}

/** The guide's line under the list: how many fit, what clashes, and any lottery's truth. */
export function summaryLine(items: readonly MustDoItem[], waitingCount: number): string | null {
  if (items.length === 0) return null;
  const checked = items.filter((item) => item.fit !== 'unknown' && !item.pending);
  const parts: string[] = [];
  if (checked.length < items.length) {
    parts.push(
      t({ id: 'setup.mustDos.line.checking', message: 'Checking them against the dates.' }),
    );
  } else {
    const fit = items.filter((item) => item.fit === 'fits').length;
    const tight = items.filter((item) => item.fit === 'tight').length;
    const clash = items.filter((item) => item.fit === 'clash').length;
    if (fit === items.length) {
      parts.push(
        t({
          id: 'setup.mustDos.line.allFit',
          message: plural(fit, { one: 'It fits.', other: 'All # fit.' }),
        }),
      );
    } else {
      if (fit > 0) parts.push(t({ id: 'setup.mustDos.line.fit', message: `${fit} fit.` }));
      if (tight > 0) {
        parts.push(
          t({
            id: 'setup.mustDos.line.tight',
            message: plural(tight, { one: 'One is tight.', other: '# are tight.' }),
          }),
        );
      }
      if (clash > 0) {
        parts.push(
          t({
            id: 'setup.mustDos.line.clash',
            message: plural(clash, {
              one: "One clashes with the dates, so I'll find it another day.",
              other: "# clash with the dates, so I'll find them other days.",
            }),
          }),
        );
      }
    }
  }
  const lottery = items.find((item) => item.pill?.kind === 'lottery');
  if (lottery !== undefined) {
    const title = lottery.title;
    parts.push(
      t({
        id: 'setup.mustDos.line.lottery',
        message: `${title} tickets are a lottery. Each of you enters on the official site. I'll remind you.`,
      }),
    );
  }
  if (waitingCount > 0) {
    parts.push(
      t({
        id: 'setup.mustDos.line.waiting',
        message: plural(waitingCount, { one: 'One more to come.', other: '# more to come.' }),
      }),
    );
  }
  return parts.join(' ');
}
