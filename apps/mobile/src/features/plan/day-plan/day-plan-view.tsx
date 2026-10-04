/**
 * The day plan (7b-1) as drawn: ← TRIP, ALL DAYS and SHARE, the day chips, the day's title with
 * its date and the rain the forecast or the check found, the live mini-map, the timeline (legs,
 * free time, the guide's notes under the stops they concern) and the add bar.
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { DayChips, PlanningTag } from '@/ui/planning';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { tokens } from '@cp/design-tokens';

import { freeGaps } from '../trip-map/day-gaps';
import type { DayRoute } from '../trip-map/day-route';
import { dateLine, stopsLine } from '../trip-map/format';
import { dayChips } from '../trip-map/sheet-copy';
import type { TripMapModel } from '../trip-map/sheet-props';
import { buildStopRows } from '../trip-map/stop-rows';
import type { TripDay } from '../trip-map/trip-days';
import { ADD_BAR_SPACE, AddBar } from './add-bar';
import { MiniMap } from './mini-map';
import { StopTimeline, type TimelineDrag } from './stop-timeline';

/** A pinch that ends below this scale zooms out to all days. */
const PINCH_OUT = 0.8;

const useStyles = makeStyles((t) => ({
  scroll: { paddingHorizontal: t.size.gutter, gap: t.space['14'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
  headStart: { flex: 1, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['12'] },
  title: { flex: 1, minWidth: 0 },
  dateCol: { alignItems: 'flex-end', gap: t.space['4'] },
}));

export interface DayPlanViewProps {
  readonly model: TripMapModel;
  readonly day: TripDay;
  readonly route: DayRoute;
  /** The order being dragged (the mini-map follows it). */
  readonly order: readonly string[] | null;
  /** "Rain likely 13–15", from the check or the forecast. */
  readonly rain: string | null;
  /** Crewmates on this day right now. */
  readonly here: readonly StackMember[];
  readonly drag: TimelineDrag | null;
  readonly picked?: string | null | undefined;
  readonly onBack: () => void;
  readonly onAllDays: () => void;
  readonly onShare: () => void;
  readonly onSelectDay: (dayNo: number) => void;
  readonly onOpenMap: () => void;
  readonly onOpenStop: (stableId: string) => void;
  readonly onAdd: () => void;
}

export function DayPlanView(props: DayPlanViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model, day, route } = props;
  const rows = useMemo(
    () =>
      buildStopRows({
        locale,
        day,
        legs: route.legs,
        startsAtStay: route.startsAtStay,
        gaps: freeGaps(
          day,
          model.members.map((member) => member.uid),
          model.tz,
        ),
        members: model.members,
        me: model.me,
      }),
    [locale, day, route, model.members, model.me, model.tz],
  );
  const titles = new Map(day.stops.map((stop) => [stop.stableId, stop.title]));
  const n = day.dayNo;
  // Pinching out zooms out to all days.
  const allDays = props.onAllDays;
  const pinch = Gesture.Pinch().onEnd((event) => {
    'worklet';
    if (event.scale < PINCH_OUT) scheduleOnRN(allDays);
  });
  return (
    <Scaffold variant="dark" testID="day-plan">
      <GestureDetector gesture={pinch}>
        <ScrollView
          scrollEnabled={props.drag === null || props.order === null}
          contentContainerStyle={[styles.scroll, { paddingBottom: ADD_BAR_SPACE + 24 }]}
        >
          <View style={styles.head}>
            <View style={styles.headStart}>
              <TextLink
                label={t({ id: 'plan.dayPlan.back', message: '← Trip' })}
                onPress={props.onBack}
                testID="day-plan-back"
              />
            </View>
            {props.here.length === 0 ? null : (
              <AvatarStack members={props.here} max={3} size="sm" testID="day-plan-here" />
            )}
            <PillButton
              size="sm"
              variant="secondary"
              label={t({ id: 'plan.dayPlan.allDays', message: 'All days' })}
              onPress={props.onAllDays}
              testID="day-plan-all-days"
            />
            <PillButton
              size="sm"
              variant="secondary"
              label={t({ id: 'plan.dayPlan.share', message: 'Share' })}
              onPress={props.onShare}
              testID="day-plan-share"
            />
          </View>
          <DayChips
            days={dayChips(model.days, locale)}
            selectedDayNo={n}
            onSelect={props.onSelectDay}
            testID="day-plan-day-chips"
          />
          <View style={styles.titleRow}>
            <Text variant="h1" style={styles.title} testID="day-plan-title">
              {day.theme ?? t({ id: 'plan.dayPlan.dayTitle', message: `Day ${n}` })}
            </Text>
            <View style={styles.dateCol}>
              {day.date === null ? null : (
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {dateLine(locale, day.date)}
                </Text>
              )}
              {props.rain === null ? null : (
                <PlanningTag label={props.rain} color={tokens.color.blue} testID="day-plan-rain" />
              )}
            </View>
          </View>
          {model.draft ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.dayPlan.draft', message: 'Your draft. Only you can see it.' })}
            </Text>
          ) : null}
          <MiniMap
            model={model}
            day={day}
            order={props.order}
            caption={stopsLine(day.stops.length, route.legs)}
            onOpen={props.onOpenMap}
          />
          {rows.length === 0 ? (
            <Text variant="body" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.dayPlan.empty', message: 'Nothing planned yet. Add the first stop.' })}
            </Text>
          ) : (
            <StopTimeline
              rows={rows}
              drag={props.drag}
              context={{
                tripId: model.tripId,
                dayNo: n,
                dayId: day.dayId,
                color: day.color,
                members: model.members,
                me: model.me,
                guide: model.guide,
                notes: true,
                picked: props.picked,
                titleOf: (id) => titles.get(id) ?? '',
                onOpenStop: (row) => props.onOpenStop(row.stop.stableId),
              }}
            />
          )}
        </ScrollView>
      </GestureDetector>
      {model.readOnly ? null : <AddBar guide={model.guide.id} onPress={props.onAdd} />}
    </Scaffold>
  );
}
