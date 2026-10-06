/**
 * The trip map's sheet at half (7a-2), and at full when it was pulled up to read the day to its
 * end: one day as a timeline under its date and place in the trip, with OPEN DAY (the day plan,
 * where stops are added, moved and edited) and ALL DAYS (the whole trip). A stop tap opens its
 * marker on the map (the only label) and eases the camera to it, a second tap opens the stop; VOTE
 * opens the decision, the check's fix its fixer and FILL IT the ideas for a free slot once those
 * screens are registered; GO, on the next stop while that day is today, the route from here.
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
import { DraftNote } from './draft-note';
import { useHereSince, useSaidStops } from '../day/stop-check-in';
import { dayProgress, nextGoStop, usePlanClock } from './next-stop';
import { travelLine } from '@/data/areas/travel-line';

import { dateLine, dayOfTrip, stopsLine, withArea } from './format';
import type { TripMapSheetProps } from './sheet-props';
import { StopList } from './stop-list';
import { buildStopRows, mineRows, stayRows } from './stop-rows';

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['12'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
  headText: { flex: 1, minWidth: 0 },
  title: { gap: t.space['2'] },
}));

export function DaySheet(
  props: TripMapSheetProps & {
    readonly onOpenDay: (dayNo: number) => void;
    readonly onMoveStops?: (() => void) | undefined;
  },
) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model, day, route } = props;
  const tz = model.tz;
  const now = usePlanClock(model.now);
  const said = useSaidStops(model.tripId);
  const hereSince = useHereSince(model.tripId, tz, locale);
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
      progress: dayProgress(day, now, tz, said),
      here: hereSince,
    });
  }, [day, locale, model.members, model.me, now, route, tz, said, hereSince]);
  const goStop = useMemo(
    () => (day === null ? null : nextGoStop(day, now, tz, said)),
    [day, now, tz, said],
  );
  if (day === null) return null;
  const n = day.dayNo;
  const of = dayOfTrip(n, model.days.length);
  const head =
    day.date === null ? withArea(of, day) : `${withArea(dateLine(locale, day.date), day)} · ${of}`;
  const title = day.theme ?? t({ id: 'plan.tripMap.dayTitle', message: `Day ${n}` });
  const titles = new Map(day.stops.map((stop) => [stop.stableId, stop.title]));
  return (
    <View style={styles.body} testID="trip-map-half">
      <View style={styles.head}>
        <Text variant="eyebrow" color={theme.semantic.text.secondary} style={styles.headText}>
          {head}
        </Text>
        <PillButton
          size="sm"
          label={t({ id: 'plan.tripMap.openDay', message: 'Open day' })}
          onPress={() => props.onOpenDay(n)}
          testID="trip-map-open-day-pill"
        />
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'plan.tripMap.allDays', message: 'All days' })}
          onPress={() => props.onSnap('full')}
          testID="trip-map-all-days"
        />
      </View>
      {/* The title keeps the sheet's full width: beside the pills it was cut after two words. */}
      <PressScale
        style={styles.title}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={t({ id: 'plan.tripMap.openDayHint', message: 'Opens the day plan' })}
        onPress={() => props.onOpenDay(n)}
        testID="trip-map-open-day"
      >
        <Text variant="h1">{title}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {stopsLine(day.stops.length, route.legs)}
        </Text>
        {day.area?.link == null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="trip-map-day-travel">
            {travelLine(day.area.link)}
          </Text>
        )}
      </PressScale>
      {/* Her own plan before the crew has one: where it stands, as on the peek. */}
      <DraftNote model={model} />
      {rows.length === 0 && (day.mine ?? []).length === 0 ? (
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.tripMap.nothingYet', message: 'Nothing planned yet' })}
        </Text>
      ) : (
        <StopList
          rows={rows}
          stay={stayRows(locale, day, route)}
          mine={mineRows(locale, day)}
          context={{
            tripId: model.tripId,
            dayNo: n,
            dayId: day.dayId,
            color: day.color,
            members: model.members,
            me: model.me,
            guide: model.guide,
            organiser: model.organiser,
            byHand: model.draft,
            notes: false,
            go: goStop === null ? [] : [goStop],
            picked: props.picked,
            titleOf: (id) => titles.get(id) ?? '',
            onOpenStop: (row) => props.onOpenStop(row.stop.stableId),
          }}
        />
      )}
    </View>
  );
}
