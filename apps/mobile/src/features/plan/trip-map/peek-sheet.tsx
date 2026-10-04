/**
 * The trip map's sheet at peek (7a-1): the day chips (weekday over date, today marked), the chosen
 * day's date and place in the trip, who is going that day, its title, "5 stops · 2h40 in the car"
 * (a tap on the title opens the day plan, with OPEN DAY beside it saying so), and the guide's line
 * about the plan check with CHECK. A picked pin's card leads the sheet. A placed-ideas review
 * waiting on me shows under it (undesigned: the guide's line with REVIEW).
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { DayChips, TokekNote } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { planRoutes } from '../overview/routes';
import { dateLine, dayOfTrip, stopsLine } from './format';
import { todayOf } from './next-stop';
import { dayChips, peekCheckLine } from './sheet-copy';
import type { TripMapSheetProps } from './sheet-props';
import { useWayOut } from './use-ways-out';
import { GuideSticker } from './guide-sticker';

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['12'] },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  titleText: { flex: 1, minWidth: 0, gap: t.space['2'] },
  title: { flexShrink: 1 },
}));

export function PeekSheet(
  props: TripMapSheetProps & {
    readonly onOpenDay: (dayNo: number) => void;
    /** The picked pin's card, above everything else. */
    readonly head?: ReactNode;
  },
) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const { model, day } = props;
  const check = useWayOut('7h-1', { tripId: model.tripId });
  const review = model.reviews[0];
  const openReview = useWayOut('7h-7', {
    tripId: model.tripId,
    changesetId: review?.changesetId ?? '',
  });
  if (day === null) return null;
  const going = new Set(day.stops.flatMap((stop) => stop.attendeeIds));
  const crew = model.members.filter((member) => going.has(member.uid));
  const n = day.dayNo;
  const of = model.days.length;
  const date = day.date === null ? '' : dateLine(locale, day.date);
  const line = peekCheckLine(model.check, locale, model.startDate);
  const title = day.theme ?? t({ id: 'plan.tripMap.dayTitle', message: `Day ${n}` });
  return (
    <View style={styles.body} testID="trip-map-peek">
      {props.head}
      <DayChips
        days={dayChips(model.days, locale, todayOf(model.now ?? new Date(), model.tz))}
        selectedDayNo={n}
        tile="control"
        onSelect={props.onSelectDay}
        testID="trip-map-day-chips"
      />
      <View style={styles.headRow}>
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {date === '' ? dayOfTrip(n, of) : `${date} · ${dayOfTrip(n, of)}`}
        </Text>
        {crew.length === 0 ? null : (
          <AvatarStack
            members={crew.map((member) => ({
              key: member.uid,
              name: member.name,
              joinIndex: member.joinIndex,
            }))}
            max={5}
            size="sm"
            testID="trip-map-going"
          />
        )}
      </View>
      <View style={styles.titleRow}>
        <PressScale
          style={styles.titleText}
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityHint={t({ id: 'plan.tripMap.openDayHint', message: 'Opens the day plan' })}
          onPress={() => props.onOpenDay(n)}
          testID="trip-map-peek-open-day"
        >
          <Text variant="h1" style={styles.title} testID="trip-map-day-title">
            {title}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {stopsLine(day.stops.length, props.route.legs)}
          </Text>
        </PressScale>
        <PillButton
          size="sm"
          variant="secondary"
          label={t({ id: 'plan.tripMap.openDay', message: 'Open day' })}
          onPress={() => props.onOpenDay(n)}
          testID="trip-map-peek-open-day-pill"
        />
      </View>
      {line === null ? null : (
        <TokekNote
          guide={model.guide.id}
          sticker={<GuideSticker guide={model.guide.id} />}
          name={model.guide.name}
          line={line}
          {...(check === null || model.check.fixes + model.check.know === 0
            ? {}
            : {
                action: {
                  label: t({ id: 'plan.tripMap.check', message: 'Check' }),
                  onPress: check,
                },
              })}
          testID="trip-map-check"
        />
      )}
      {model.draft ? (
        <TokekNote
          guide={model.guide.id}
          sticker={<GuideSticker guide={model.guide.id} />}
          name={model.guide.name}
          line={t({
            id: 'plan.tripMap.draftOnly',
            message: 'This is your draft. Only you can see it until you send it.',
          })}
          action={{
            label: t({ id: 'plan.tripMap.draftReview', message: 'Review' }),
            onPress: () => router.push(planRoutes.draft(model.tripId)),
          }}
          testID="trip-map-draft"
        />
      ) : null}
      {review === undefined ? null : (
        <TokekNote
          guide={model.guide.id}
          sticker={<GuideSticker guide={model.guide.id} />}
          name={model.guide.name}
          line={t({
            id: 'plan.tripMap.reviewReady',
            message: 'I placed your ideas. Have a look before the crew does.',
          })}
          {...(openReview === null
            ? {}
            : {
                action: {
                  label: t({ id: 'plan.tripMap.review', message: 'Review' }),
                  onPress: openReview,
                },
              })}
          testID="trip-map-review"
        />
      )}
    </View>
  );
}
