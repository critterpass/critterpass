/**
 * All days (7b-3) as drawn: ← back to the day it came from with SHARE, the trip's name and length,
 * the plan check's card with SEE, and the days as a two-column grid of cards. A held stop glides
 * under the finger while it is dragged to another card.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TokekNote } from '@/ui/planning';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { clock } from '../day/format';
import { dateLine, weekday } from '../trip-map/format';
import { daySummary, tripCheckLine } from '../trip-map/sheet-copy';
import type { TripMapModel } from '../trip-map/sheet-props';
import type { TripDay } from '../trip-map/trip-days';
import { useWayOut } from '../trip-map/use-ways-out';
import { AllDaysCard } from './day-card';
import type { CardRect } from './use-cross-day-drag';

const useStyles = makeStyles((t) => ({
  scroll: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['14'] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['10'] },
  cell: { width: '48.5%' },
}));

export interface AllDaysViewProps {
  readonly model: TripMapModel;
  /** The day it was opened from (← goes back to it). */
  readonly from: TripDay | null;
  readonly over: number | null;
  readonly dragging: boolean;
  readonly measureKey: number;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onOpenDay: (dayNo: number) => void;
  readonly onMoveMenu: (dayNo: number) => void;
  readonly onRect: (rect: CardRect) => void;
  readonly onHold: (stop: DayItem, dayNo: number) => void;
  readonly onDrag: (x: number, y: number) => void;
  readonly onDrop: (x: number, y: number) => void;
}

/** Days with nothing planned that a saved idea fits well. */
function ideaDays(model: TripMapModel): Set<number> {
  return new Set(
    model.ideas.flatMap((idea) =>
      (idea.fit?.days ?? []).filter((day) => day.grade === 'good').map((day) => day.day_no),
    ),
  );
}

export function AllDaysView(props: AllDaysViewProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const { model } = props;
  const see = useWayOut('7h-1', { tripId: model.tripId });
  const line = tripCheckLine(model.check);
  const place = model.destination ?? '';
  const count = model.days.length;
  const fits = ideaDays(model);
  const back =
    props.from?.date == null
      ? t({ id: 'plan.allDays.back', message: 'Back' })
      : dateLine(locale, props.from.date);
  return (
    <Scaffold variant="dark" testID="all-days">
      <ScrollView scrollEnabled={!props.dragging} contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <BackEyebrow label={back} onPress={props.onBack} testID="all-days-back" />
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'plan.allDays.share', message: 'Share' })}
            onPress={props.onShare}
            testID="all-days-share"
          />
        </View>
        <Text variant="h1">
          {place === ''
            ? t({ id: 'plan.allDays.titleDays', message: `${count} days` })
            : t({ id: 'plan.allDays.title', message: `${place}, ${count} days` })}
        </Text>
        {line === null ? null : (
          <TokekNote
            guide={model.guide.id}
            name={model.guide.name}
            line={line}
            detail={t({
              id: 'plan.allDays.checkDetail',
              message: 'Checked against opening hours, drives and bookings.',
            })}
            {...(see === null
              ? {}
              : { action: { label: t({ id: 'plan.allDays.see', message: 'See' }), onPress: see } })}
            testID="all-days-check"
          />
        )}
        <View style={styles.grid}>
          {model.days.map((day) => (
            <View key={day.dayNo} style={styles.cell}>
              <AllDaysCard
                day={day}
                weekday={weekday(locale, day.date)}
                summary={
                  day.stops.length === 0 && fits.has(day.dayNo)
                    ? t({ id: 'plan.allDays.ideasFit', message: 'Ideas fit here' })
                    : daySummary(day, (minutes) => clock(locale, minutes))
                }
                over={props.dragging && props.over === day.dayNo}
                canMove={!model.readOnly}
                measureKey={props.measureKey}
                onOpen={() => props.onOpenDay(day.dayNo)}
                onMoveMenu={() => props.onMoveMenu(day.dayNo)}
                onRect={props.onRect}
                onHold={(stop) => props.onHold(stop, day.dayNo)}
                onDrag={props.onDrag}
                onDrop={props.onDrop}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </Scaffold>
  );
}
