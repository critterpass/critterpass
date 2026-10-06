/** The share sheet's words built from data: day names, the expiry and the open count. */
/* eslint-disable lingui/no-unlocalized-strings -- Intl options, never copy. */
import { plural, t } from '@lingui/core/macro';

import { DRIVER_PLAN_MAX_EXPIRY_DAYS } from '@cp/domain';

/** The expiry the sheet steps through, in days; the last is the longest a link may live. */
export const EXPIRY_STEPS: readonly number[] = [7, 14, 30, DRIVER_PLAN_MAX_EXPIRY_DAYS];

export function nextExpiry(current: number): number {
  const index = EXPIRY_STEPS.indexOf(current);
  return EXPIRY_STEPS[(index + 1) % EXPIRY_STEPS.length] ?? DRIVER_PLAN_MAX_EXPIRY_DAYS;
}

/** "Wed 14" for a dated day, else "Day 3". */
export function dayLabel(locale: string, date: string | null, dayNo: number): string {
  if (date === null) return t({ id: 'drivers.share.dayNo', message: `Day ${dayNo}` });
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "In 14 days · 1 Nov": from the live link's expiry, or the chosen length before there is one. */
export function expiryChoices(locale: string, expiresAt: string | null, days: number): string {
  const end = expiresAt === null ? new Date(Date.now() + days * 86_400_000) : new Date(expiresAt);
  const left = Math.max(1, Math.round((end.getTime() - Date.now()) / 86_400_000));
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(end);
  return t({
    id: 'drivers.share.expiresIn',
    message: plural(left, { one: `In # day · ${date}`, other: `In # days · ${date}` }),
  });
}

/** "Opened twice · last at 10:14": null before the first open. */
export function openedLine(
  locale: string,
  count: number,
  lastOpenedAt: string | null,
): string | null {
  if (count === 0 || lastOpenedAt === null) return null;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(lastOpenedAt),
  );
  return t({
    id: 'drivers.share.opened',
    message: plural(count, {
      one: `Opened once · last at ${time}`,
      2: `Opened twice · last at ${time}`,
      other: `Opened # times · last at ${time}`,
    }),
  });
}
