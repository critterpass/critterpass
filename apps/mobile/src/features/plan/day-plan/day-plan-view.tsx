/**
 * The day plan (7b-1) as drawn: ← TRIP, ALL DAYS and SHARE, the day chips (weekday over date),
 * the day's title with its date, its place in the trip and the rain the forecast or the check
 * found, the live mini-map, the timeline (when to leave the stay, legs, free time, the guide's
 * notes under the stops they concern, the stops only I have) and the add bar. Today's day links to
 * day-of (when to leave, who is up), marks what is over and what is next, and offers GO on the
 * next stop only.
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
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { FOOTER_FADE_PT, FooterFade } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { tokens } from '@cp/design-tokens';

import { freeGaps } from '../trip-map/day-gaps';
import type { DayRoute } from '../trip-map/day-route';
import { travelLine } from '@/data/areas/travel-line';

import { dateLine, dayOfTrip, stopsLine, withArea } from '../trip-map/format';
import { useHereSince, useSaidStops } from '../day/stop-check-in';
import { dayProgress, nextGoStop, todayOf, usePlanClock } from '../trip-map/next-stop';
import { dayChips } from '../trip-map/sheet-copy';
import type { TripMapModel } from '../trip-map/sheet-props';
import { buildStopRows, mineRows, stayRows } from '../trip-map/stop-rows';
import type { TripDay } from '../trip-map/trip-days';
import { AddBar } from './add-bar';
import { MiniMap } from './mini-map';
import type { BackTarget } from './back-to-trip';
import { backLabel } from './back-label';
import { StopTimeline, TravelEdge, type TimelineDrag } from './stop-timeline';

/** A day's title wraps until it is whole (the guide writes up to a short sentence). */
const TITLE_LINES = 6;
/** A pinch that ends below this scale zooms out to all days. */
const PINCH_OUT = 0.8;

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: t.size.gutter, gap: t.space['14'] },
  // The pills drop to a second line when the back label and the crew leave them no room.
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space['8'] },
  headStart: { flexGrow: 1, alignItems: 'flex-start' },
  titleBlock: { gap: t.space['4'] },
  // The date and the day trip's area sit above the title: beside it, a long area name squeezed
  // the title to a word per line.
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: t.space['8'],
  },
  // On its own line: beside the title it took the title's room ("RIVER LIGHTS AND EAS…").
  rain: { alignItems: 'flex-start' },
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
  /** Where back lands, which its label names. */
  readonly backTo?: BackTarget | undefined;
  /** Opens day-of (when to leave, who is up, the pack list); offered on today's day. */
  readonly onDayOf?: (() => void) | undefined;
  readonly onAllDays: () => void;
  readonly onShare: () => void;
  readonly onSelectDay: (dayNo: number) => void;
  readonly onOpenMap: () => void;
  readonly onOpenStop: (stableId: string) => void;
  readonly onAdd: () => void;
  /** False while another screen covers the day: its mini-map's camera waits. @default true */
  readonly focused?: boolean | undefined;
  /** Opens a day trip's area page (change or remove the day trip), by the area's id. */
  readonly onOpenArea?: ((areaId: string) => void) | undefined;
}

export function DayPlanView(props: DayPlanViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model, day, route } = props;
  const now = usePlanClock(model.now);
  const said = useSaidStops(model.tripId);
  const hereSince = useHereSince(model.tripId, model.tz, locale);
  const progress = useMemo(() => dayProgress(day, now, model.tz, said), [day, now, model.tz, said]);
  const goStop = nextGoStop(day, now, model.tz, said);
  const rows = useMemo(
    () =>
      buildStopRows({
        locale,
        day,
        after: route.after,
        gaps: freeGaps(
          day,
          model.members.map((member) => member.uid),
          model.tz,
        ),
        members: model.members,
        me: model.me,
        progress,
        here: hereSince,
      }),
    [locale, day, route, model.members, model.me, model.tz, progress, hereSince],
  );
  const titles = new Map(day.stops.map((stop) => [stop.stableId, stop.title]));
  // A day trip opens and ends with how to get there; a day whose link is gone shows no line.
  const travel = day.area?.link == null ? undefined : travelLine(day.area.link);
  const areaId = day.area?.id;
  const openArea = props.onOpenArea;
  const onTravel =
    areaId === undefined || openArea === undefined ? undefined : () => openArea(areaId);
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
          style={styles.fill}
          contentContainerStyle={[styles.scroll, { paddingBottom: FOOTER_FADE_PT + 12 }]}
        >
          <View style={styles.head}>
            <View style={styles.headStart}>
              <BackEyebrow
                label={backLabel(props.backTo ?? 'tripMap')}
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
            {model.draft ? null : (
              <PillButton
                size="sm"
                variant="secondary"
                label={t({ id: 'plan.dayPlan.share', message: 'Share' })}
                onPress={props.onShare}
                testID="day-plan-share"
              />
            )}
          </View>
          <DayChips
            days={dayChips(model.days, locale, todayOf(now, model.tz))}
            selectedDayNo={n}
            onSelect={props.onSelectDay}
            testID="day-plan-day-chips"
          />
          <View style={styles.titleBlock}>
            <View style={styles.dateRow}>
              {day.date === null ? null : (
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {withArea(dateLine(locale, day.date), day)}
                </Text>
              )}
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {dayOfTrip(n, model.days.length)}
              </Text>
            </View>
            <Text
              variant="h1"
              numberOfLines={TITLE_LINES}
              singleLine={false}
              testID="day-plan-title"
            >
              {day.theme ?? t({ id: 'plan.dayPlan.dayTitle', message: `Day ${n}` })}
            </Text>
          </View>
          {props.rain === null ? null : (
            <View style={styles.rain}>
              <PlanningTag label={props.rain} color={tokens.color.blue} testID="day-plan-rain" />
            </View>
          )}
          {model.draft ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.dayPlan.draft', message: 'Your draft. Only you can see it.' })}
            </Text>
          ) : null}
          {progress === null || props.onDayOf === undefined ? null : (
            <TextLink
              label={t({
                id: 'plan.dayPlan.toDayOf',
                message: 'Today: when to leave and who’s up',
              })}
              onPress={props.onDayOf}
              testID="day-plan-day-of"
            />
          )}
          <MiniMap
            model={model}
            day={day}
            order={props.order}
            active={props.focused ?? true}
            caption={stopsLine(day.stops.length, route.legs)}
            onOpen={props.onOpenMap}
          />
          {rows.length === 0 && (day.mine ?? []).length === 0 ? (
            <>
              {travel === undefined ? null : (
                <TravelEdge line={travel} onPress={onTravel} testID="day-plan-travel-out" />
              )}
              <Text variant="body" color={theme.semantic.text.secondary}>
                {t({
                  id: 'plan.dayPlan.empty',
                  message: 'Nothing planned yet. Add the first stop.',
                })}
              </Text>
            </>
          ) : (
            <StopTimeline
              rows={rows}
              stay={stayRows(locale, day, route)}
              mine={mineRows(locale, day)}
              travel={travel}
              onTravel={onTravel}
              drag={props.drag}
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
                notes: true,
                go: goStop === null ? [] : [goStop],
                handle: props.drag !== null,
                picked: props.picked,
                titleOf: (id) => titles.get(id) ?? '',
                onOpenStop: (row) => props.onOpenStop(row.stop.stableId),
              }}
            />
          )}
        </ScrollView>
      </GestureDetector>
      {model.readOnly ? null : (
        <>
          <FooterFade />
          <AddBar guide={model.guide.id} onPress={props.onAdd} />
        </>
      )}
    </Scaffold>
  );
}
