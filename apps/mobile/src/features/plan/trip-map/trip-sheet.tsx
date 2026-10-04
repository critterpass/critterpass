/**
 * The trip map's sheet at full (7a-3): the crew and dates with SHARE, THE WHOLE TRIP and the
 * countdown, the plan check's card with SEE, every day as a row (its tag and how full it is; a row
 * opens that day at half), and the saved places not in a day yet with IDEAS.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { PaceBars, PlanningDayRow, PlanningTag, TokekNote } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock } from '../day/format';
import { tagColor, tagLabel, tripDates, weekday } from './format';
import { countdownLine, daySummary, paceWords, tripCheckLine } from './sheet-copy';
import type { TripMapSheetProps } from './sheet-props';
import { useWayOut } from './use-ways-out';

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['12'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space['12'],
  },
  title: { flexShrink: 1 },
  rows: { gap: t.space['8'] },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space['12'],
    paddingTop: t.space['4'],
  },
  footText: { flex: 1, minWidth: 0 },
}));

export function TripSheet(props: TripMapSheetProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model } = props;
  const seeCheck = useWayOut('7h-1', { tripId: model.tripId });
  const openIdeas = useWayOut('7f-2', { tripId: model.tripId });
  const who = model.crewName ?? model.destination ?? '';
  const dates = tripDates(locale, model.startDate, model.endDate);
  const head = [who, dates].filter((part) => part !== '').join(' · ');
  const countdown = countdownLine(model.countdownTo);
  const line = tripCheckLine(model.check);
  const ideas = model.ideas.length;
  return (
    <View style={styles.body} testID="trip-map-full">
      <View style={styles.row}>
        <Text variant="eyebrow" color={theme.semantic.text.secondary} style={styles.title}>
          {head}
        </Text>
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'plan.tripMap.share', message: 'Share' })}
          onPress={props.onShare}
          testID="trip-map-share"
        />
      </View>
      <View style={styles.row}>
        <Text variant="h1" style={styles.title}>
          {t({ id: 'plan.tripMap.wholeTrip', message: 'The whole trip' })}
        </Text>
        {countdown === null ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {countdown}
          </Text>
        )}
      </View>
      {line === null ? null : (
        <TokekNote
          guide={model.guide.id}
          name={model.guide.name}
          line={line}
          detail={t({
            id: 'plan.tripMap.checkDetail',
            message: 'Checked against opening hours, drives, bookings and everyone’s saves.',
          })}
          {...(seeCheck === null
            ? {}
            : {
                action: { label: t({ id: 'plan.tripMap.see', message: 'See' }), onPress: seeCheck },
              })}
          testID="trip-map-check-card"
        />
      )}
      <View style={styles.rows}>
        {model.days.map((day) => {
          const name = weekday(locale, day.date);
          const n = day.dayNo;
          const title = day.theme ?? t({ id: 'plan.tripMap.dayTitle', message: `Day ${n}` });
          return (
            <PlanningDayRow
              key={day.dayNo}
              dayNo={day.dayNo}
              weekday={name}
              color={day.color}
              title={title}
              summary={daySummary(day, (minutes) => clock(locale, minutes))}
              tag={
                day.tag === null ? undefined : (
                  <PlanningTag
                    label={tagLabel(day.tag)}
                    color={tagColor(day.tag)}
                    testID={`trip-day-${String(day.dayNo)}-tag`}
                  />
                )
              }
              pace={
                <PaceBars level={day.pace} color={day.color} accessibilityLabel={paceWords(day)} />
              }
              onPress={() => {
                props.onSelectDay(day.dayNo);
                props.onSnap('half');
              }}
              accessibilityLabel={`${String(day.dayNo)} ${name}, ${title}`}
              testID={`trip-day-${String(day.dayNo)}`}
            />
          );
        })}
      </View>
      {ideas === 0 ? null : (
        <View style={styles.foot}>
          <Text variant="body" style={styles.footText}>
            {t({
              id: 'plan.tripMap.ideasWaiting',
              message: plural(ideas, {
                one: '# saved place isn’t in a day yet',
                other: '# saved places aren’t in a day yet',
              }),
            })}
          </Text>
          {openIdeas === null ? null : (
            <PillButton
              size="sm"
              label={t({ id: 'plan.tripMap.ideas', message: 'Ideas ›' })}
              onPress={openIdeas}
              testID="trip-map-ideas"
            />
          )}
        </View>
      )}
    </View>
  );
}
