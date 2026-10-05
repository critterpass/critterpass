/**
 * Under Home's card on a trip day: the next stop with its time (or that nothing more is planned
 * today) and one button into the day. Undesigned; logged in docs/undesigned-states.md. It holds
 * the trip's streams, since Home sits outside the trip's routes and the plan's rows sync with it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { clockOption } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import { shownStop, useReadsLocalNames } from '@/data/places/use-shown-names';

import { useLiveRows } from './data/watch-query';
import { homeRoutes } from './routes';

const NEXT_STOP_SQL = `SELECT i.starts_at, i.tz, i.notes, i.category, p.name AS poi_name,
    p.name_local AS poi_name_local, t.destination_id
  FROM plan_items i
  JOIN trips t ON t.id = i.trip_id AND t.current_version_id = i.version_id
  LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.trip_id = ? AND julianday(i.starts_at) > julianday(?)
  ORDER BY i.starts_at LIMIT 1`;
const NEXT_STOP_TABLES = ['plan_items', 'trips', 'pois'];

interface NextStopRow {
  readonly starts_at: string;
  readonly tz: string | null;
  readonly notes: string | null;
  readonly category: string | null;
  readonly poi_name: string | null;
  readonly poi_name_local: string | null;
  readonly destination_id: string | null;
}

export interface TodayStripProps {
  readonly tripId: string;
  readonly tz: string | null;
  /** Today on the trip's clock, `YYYY-MM-DD`. */
  readonly today: string;
  /** "Now" to the minute, as an ISO string. */
  readonly minuteIso: string;
}

export function TodayStrip({ tripId, tz, today, minuteIso }: TodayStripProps) {
  const { t } = useLingui();
  const locale = useLocale();
  useTripStreams(tripId);
  const { rows } = useLiveRows<NextStopRow>(NEXT_STOP_SQL, [tripId, minuteIso], NEXT_STOP_TABLES);
  const next = rows[0] ?? null;
  const zone = next?.tz ?? tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const at = next === null ? null : new Date(next.starts_at);
  // Only a stop still ahead today is "next": tomorrow's first stop is not today's news.
  const isToday = at !== null && toLocalWallTime(at, zone).date === today;
  const time =
    at === null
      ? ''
      : new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
          timeZone: zone,
          ...clockOption(),
        }).format(at);
  const readsLocal = useReadsLocalNames(next?.destination_id ?? null);
  const name =
    (next === null ? null : shownStop(next, readsLocal)) ?? next?.notes ?? next?.category ?? '';
  const line =
    isToday && name !== ''
      ? t({ id: 'home.today.next', message: `Next: ${time} · ${name}` })
      : t({ id: 'home.today.done', message: 'Nothing more on the plan today.' });
  const day = homeRoutes.tripDay(tripId);
  return (
    <Card testID="home-today">
      <Stack gap="12">
        <Text variant="body" singleLine={false}>
          {line}
        </Text>
        {day === undefined ? null : (
          <View style={{ alignSelf: 'flex-start' }}>
            <PillButton
              size="sm"
              tone="ink"
              label={upper(t({ id: 'home.today.open', message: 'Open today' }), locale)}
              onPress={() => router.push(day)}
              testID="home-today-button"
            />
          </View>
        )}
      </Stack>
    </Card>
  );
}
