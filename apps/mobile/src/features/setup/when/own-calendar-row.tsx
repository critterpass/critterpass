/**
 * This person's own part of the dates step, under the heatmap: whether their calendar counts yet
 * (not connected, syncing, synced n ago, stale after three days, access denied, failed) and the
 * one action that moves it forward (connect, sync now, mark days by hand). Undesigned; built from
 * the card, secondary text and inline action patterns.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { CALENDAR_STALE_HOURS } from '@cp/domain';
import { format } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type OwnCalendarStatus =
  'unavailable' | 'needs_permission' | 'denied' | 'syncing' | 'synced' | 'error';

export interface OwnCalendar {
  readonly status: OwnCalendarStatus;
  readonly lastSyncedAt: Date | null;
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
    gap: th.space['10'],
  },
  text: { flex: 1, gap: th.space['2'] },
}));

function agoLabel(locale: string, at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
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

export function OwnCalendarRow({ calendar, now, onConnect, onMarkByHand }: OwnCalendarRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
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
  return (
    <Row
      align="center"
      style={styles.row}
      testID={`own-calendar-${stale ? 'stale' : calendar.status}`}
    >
      <View style={styles.text}>
        <Text variant="rowTitle">{title}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {line}
        </Text>
      </View>
      <InlineAction label={action.label} onPress={action.onPress} testID="own-calendar-action" />
    </Row>
  );
}
