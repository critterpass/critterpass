/**
 * The trip map's sheet at half (7a-2): one day as a timeline under its date, stop count and time
 * in the car, with ALL DAYS to pull the sheet up to the whole trip. A stop tap opens its marker on
 * the map (the only label) and eases the camera to it; VOTE opens the decision, SWAP? the rain
 * swap and FILL IT the ideas for a free slot once those screens are registered.
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { freeGaps } from './day-gaps';
import { dateLine, stopsLine } from './format';
import type { TripMapSheetProps } from './sheet-props';
import { StopList } from './stop-list';
import { buildStopRows } from './stop-rows';

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['12'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  headText: { flex: 1, minWidth: 0, gap: t.space['2'] },
}));

export function DaySheet(
  props: TripMapSheetProps & { readonly onOpenDay: (dayNo: number) => void },
) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model, day, route } = props;
  const tz = model.tz;
  const rows = useMemo(() => {
    if (day === null) return [];
    const crew = model.members.map((member) => member.uid);
    return buildStopRows({
      locale,
      day,
      after: route.after,
      gaps: freeGaps(day, crew, tz),
      members: model.members,
      me: model.me,
    });
  }, [day, locale, model.members, model.me, route, tz]);
  if (day === null) return null;
  const n = day.dayNo;
  const stops = stopsLine(day.stops.length, route.legs);
  const head = day.date === null ? stops : `${dateLine(locale, day.date)} · ${stops}`;
  const title = day.theme ?? t({ id: 'plan.tripMap.dayTitle', message: `Day ${n}` });
  const titles = new Map(day.stops.map((stop) => [stop.stableId, stop.title]));
  return (
    <View style={styles.body} testID="trip-map-half">
      <View style={styles.head}>
        <PressScale
          style={styles.headText}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={t({ id: 'plan.tripMap.openDayHint', message: 'Opens the day plan' })}
          onPress={() => props.onOpenDay(n)}
          testID="trip-map-open-day"
        >
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {head}
          </Text>
          <Text variant="h1">{title}</Text>
        </PressScale>
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'plan.tripMap.allDays', message: 'All days' })}
          onPress={() => props.onSnap('full')}
          testID="trip-map-all-days"
        />
      </View>
      {rows.length === 0 ? (
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.tripMap.nothingYet', message: 'Nothing planned yet' })}
        </Text>
      ) : (
        <StopList
          rows={rows}
          context={{
            tripId: model.tripId,
            dayNo: n,
            dayId: day.dayId,
            color: day.color,
            members: model.members,
            me: model.me,
            guide: model.guide,
            notes: false,
            picked: props.picked,
            titleOf: (id) => titles.get(id) ?? '',
            onOpenStop: (row) => props.onOpenStop(row.stop.stableId),
          }}
        />
      )}
    </View>
  );
}
