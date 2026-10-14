import { t } from '@lingui/core/macro';
import { CALENDAR_STALE_HOURS } from '@cp/domain';
import { format } from '@cp/i18n';

export type OwnCalendarStatus =
  'unavailable' | 'needs_permission' | 'denied' | 'syncing' | 'synced' | 'error';

export interface OwnCalendar {
  readonly status: OwnCalendarStatus;
  readonly lastSyncedAt: Date | null;
}

function agoLabel(locale: string, at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  // Under a minute the relative format says "this minute"; people say "just now".
  if (minutes === 0) return t({ id: 'setup.when.own.justNow', message: 'just now' });
  if (minutes < 60) return format.relativeTime(locale, -minutes, 'minute', { numeric: 'auto' });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return format.relativeTime(locale, -hours, 'hour', { numeric: 'auto' });
  return format.relativeTime(locale, -Math.round(hours / 24), 'day', { numeric: 'auto' });
}

export function isStale(calendar: OwnCalendar, now: Date): boolean {
  return (
    calendar.status === 'synced' &&
    calendar.lastSyncedAt !== null &&
    now.getTime() - calendar.lastSyncedAt.getTime() > CALENDAR_STALE_HOURS * 3_600_000
  );
}

export interface OwnCalendarRowProps {
  readonly calendar: OwnCalendar;
  readonly now: Date;
  readonly onConnect: () => void;
  readonly onMarkByHand: () => void;
}

/** What the row says about this person's own calendar, and its one action, for either look. */
export function ownCalendarWords(
  { calendar, now, onConnect, onMarkByHand }: OwnCalendarRowProps,
  locale: string,
): {
  readonly title: string;
  readonly line: string;
  readonly action: { readonly label: string; readonly onPress: () => void };
  readonly stale: boolean;
} {
  const stale = isStale(calendar, now);
  const ago = calendar.lastSyncedAt === null ? '' : agoLabel(locale, calendar.lastSyncedAt, now);
  let title: string;
  let line: string;
  let action: { label: string; onPress: () => void };
  switch (calendar.status) {
    case 'syncing':
      title = t({ id: 'setup.when.own.syncing', message: 'Syncing your calendar' });
      line = t({
        id: 'setup.when.own.syncingLine',
        message: 'Only free or busy per day leaves your phone.',
      });
      action = {
        label: t({ id: 'setup.when.own.byHand', message: 'Mark by hand' }),
        onPress: onMarkByHand,
      };
      break;
    case 'synced':
      title = stale
        ? t({ id: 'setup.when.own.stale', message: `Your calendar synced ${ago}` })
        : t({ id: 'setup.when.own.synced', message: `Your calendar is in · ${ago}` });
      line = stale
        ? t({ id: 'setup.when.own.staleLine', message: 'Sync again so your days still count.' })
        : t({ id: 'setup.when.own.syncedLine', message: 'Only free or busy per day is shared.' });
      action = { label: t({ id: 'setup.when.own.change', message: 'Change' }), onPress: onConnect };
      break;
    case 'denied':
      title = t({ id: 'setup.when.own.denied', message: 'No calendar access' });
      line = t({ id: 'setup.when.own.deniedLine', message: 'Mark the days you can’t go instead.' });
      action = {
        label: t({ id: 'setup.when.own.byHand', message: 'Mark by hand' }),
        onPress: onMarkByHand,
      };
      break;
    case 'error':
      title = t({ id: 'setup.when.own.error', message: 'Your calendar didn’t sync' });
      line = t({
        id: 'setup.when.own.errorLine',
        message: 'Try again, or mark your days by hand.',
      });
      action = {
        label: t({ id: 'setup.when.own.retry', message: 'Try again' }),
        onPress: onConnect,
      };
      break;
    case 'unavailable':
    case 'needs_permission':
      title = t({ id: 'setup.when.own.none', message: 'Your days aren’t in yet' });
      line = t({
        id: 'setup.when.own.noneLine',
        message: 'Connect your calendar. Only free or busy per day is shared, never what’s in it.',
      });
      action = {
        label: t({ id: 'setup.when.own.connect', message: 'Connect' }),
        onPress: onConnect,
      };
  }
  return { title, line, action, stale };
}
